import Anthropic from '@anthropic-ai/sdk';
import { UserDataFunctions, type RayfinContext } from '@microsoft/fabric-user-data-functions';

import { QA_CATALOG } from './qa-catalog.js';

const udf = new UserDataFunctions();

/** One Claude turn for the in-app Q&A. `contentJson` is the assistant message content to echo back unchanged. */
export interface QaTurn {
  /** ok | not_configured | invalid_request | refusal | rate_limited | provider_error */
  status: string;
  /** Claude's stop reason when status is ok (end_turn, tool_use, max_tokens, ...). */
  stopReason: string;
  /** JSON array of the assistant content blocks (text, thinking, tool_use, fallback), or "[]". */
  contentJson: string;
  /** A short, user-safe explanation when status is not ok. */
  message: string;
}

const MODEL = 'claude-opus-5-5';
const MAX_MESSAGES = 60;
const MAX_CONVERSATION_CHARS = 600_000;
const MAX_QUESTION_CHARS = 2_000;

const SYSTEM = `You answer ad-hoc questions inside Contoso Hardware's Customer 360 app. Contoso is a fictional hardware & widgets maker and all data is test data.
Customers are unified across ERP (wholesale accounts), Shopify (direct consumers), Klaviyo (marketing) and Zendesk (support).
- customerType is 'Wholesale' (B2B), 'Direct' (B2C), 'Prospect' (marketing only) or 'Unresolved' (support only).
- Data is as of 2026-09-28. "Ttm" columns are the last 12 months; "Prior" columns are the 12 months before that.
- churnRiskScore is 0-100 (churnRiskBand High >= 60, Medium 35-59, Low < 35); churnDrivers is JSON listing the points behind the score.
- revenueAtRisk = netSalesTtm x churnRiskScore / 100. upsellValueEst is estimated incremental annual sales.
- Rates (returnRateTtm, salesYoy, engagementRate90d, penetration, confidence) are fractions: 0.12 means 12%.

Get every number from the query_gold_table tool; never estimate or invent figures. Query as many times as you need, and prefer aggregates (group_by + aggregates) over pulling many rows.
Answer in at most about 200 words of plain text. Use short paragraphs and "- " bullets; no tables and no markdown headings. Show money as $ with thousands separators and no cents, percentages with one decimal, and name customers by customerName.
End with one line starting "Source:" naming the tables you used. If the tables cannot answer the question, say so plainly.

Tables you can query (entity: description; columns as name:type):
${QA_CATALOG.map((t) => `- ${t.entity}: ${t.description}\n  columns: ${t.columns.map((c) => `${c.name}:${c.type}`).join(', ')}`).join('\n')}`;

const TOOL = {
  name: 'query_gold_table',
  description:
    'Read rows from one Customer 360 gold table through the app\'s read-only data connection. Either list columns (optionally with filters, order_by and limit), or aggregate: set group_by (may be empty for a grand total) and aggregates. Filter values are strings; they are converted to the column type. limit is 1-200 (default 50). Returns JSON rows.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['table', 'columns', 'filters', 'group_by', 'aggregates', 'order_by', 'limit'],
    properties: {
      table: { type: 'string', enum: QA_CATALOG.map((t) => t.entity) },
      columns: { type: 'array', items: { type: 'string' }, description: 'Columns to return (ignored when aggregating).' },
      filters: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['column', 'op', 'value'],
          properties: {
            column: { type: 'string' },
            op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith'] },
            value: { type: 'string' },
          },
        },
      },
      group_by: { type: 'array', items: { type: 'string' } },
      aggregates: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['alias', 'op', 'column'],
          properties: {
            alias: { type: 'string' },
            op: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
            column: { type: 'string', description: 'A numeric column.' },
          },
        },
      },
      order_by: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['column', 'direction'],
          properties: { column: { type: 'string' }, direction: { type: 'string', enum: ['asc', 'desc'] } },
        },
      },
      limit: { type: 'integer', description: '1-200' },
    },
  },
};

function fail(status: string, message: string): QaTurn {
  return { status, stopReason: '', contentJson: '[]', message };
}

function lastUserText(messages: Anthropic.Beta.BetaMessageParam[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return '';
  if (typeof last.content === 'string') return last.content;
  return last.content.filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text').map((b) => b.text).join('\n');
}

udf.func(
  'askCustomer360',
  async (conversationJson: string, ctx: RayfinContext<Record<string, never>>): Promise<QaTurn> => {
    // Validate and bound the conversation before anything leaves the function.
    if (typeof conversationJson !== 'string' || conversationJson.length > MAX_CONVERSATION_CHARS) {
      return fail('invalid_request', 'The conversation is too long. Start a new question.');
    }
    let messages: Anthropic.Beta.BetaMessageParam[];
    try {
      const parsed: unknown = JSON.parse(conversationJson);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_MESSAGES) throw new Error('shape');
      messages = parsed as Anthropic.Beta.BetaMessageParam[];
    } catch {
      return fail('invalid_request', 'The conversation could not be read. Start a new question.');
    }
    if (lastUserText(messages).length > MAX_QUESTION_CHARS) {
      return fail('invalid_request', `Questions are limited to ${MAX_QUESTION_CHARS} characters.`);
    }

    let apiKey: string;
    try {
      apiKey = ctx.Secrets.ANTHROPIC_API_KEY;
    } catch {
      return fail('not_configured', 'Q&A is not configured yet: the ANTHROPIC_API_KEY secret has not been set for this app.');
    }

    const client = new Anthropic({ apiKey, timeout: 200_000, maxRetries: 1 });
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16_000,
        // Anthropic's recommended fallback model re-runs the turn if the classifiers decline it.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        system: SYSTEM,
        tools: [TOOL],
        messages,
      });
      if (response.stop_reason === 'refusal') {
        return fail('refusal', 'That question was declined. Try rephrasing it around the Customer 360 data.');
      }
      return { status: 'ok', stopReason: response.stop_reason ?? '', contentJson: JSON.stringify(response.content), message: '' };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return fail('not_configured', 'The Anthropic API key for this app was rejected. Ask the app owner to update the ANTHROPIC_API_KEY secret.');
      }
      if (error instanceof Anthropic.RateLimitError) {
        return fail('rate_limited', 'Q&A is busy right now. Try again in a minute.');
      }
      if (error instanceof Anthropic.BadRequestError) {
        return fail('invalid_request', 'The request to the model was rejected. Start a new question.');
      }
      return fail('provider_error', 'The model could not be reached. Try again shortly.');
    }
  },
  []
);
