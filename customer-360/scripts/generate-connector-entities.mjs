// Generates Category A entity files for a connector from its discovered metadata.json, following the
// entity generation contract in @microsoft/rayfin-connector-fabric-graphql/assets/docs/entities.md.
//
//   node scripts/generate-connector-entities.mjs <connector> <tablePrefixOrName>...
//   node scripts/generate-connector-entities.mjs c360lakehouse gold_
//
// Writes rayfin/connectors/<connector>/<Entity>.ts per table and the aggregate schema.ts.
// Lakehouse SQL endpoints expose no PK/FK metadata, so entities are keyless and relationship-free.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [connector, ...selectors] = process.argv.slice(2);
if (!connector || selectors.length === 0) {
  console.error('usage: generate-connector-entities.mjs <connector> <tablePrefixOrName>...');
  process.exit(1);
}
const dir = join('rayfin', 'connectors', connector);
const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
const RESERVED = new Set(['Any', 'Base64String', 'Boolean', 'Byte', 'ByteArray', 'Date', 'DateTime', 'Decimal', 'Duration',
  'Float', 'ID', 'Int', 'LocalDate', 'LocalDateTime', 'LocalTime', 'Long', 'Mutation', 'Query', 'Short', 'SignedByte',
  'Single', 'String', 'Subscription', 'Time', 'TimeSpan', 'UnsignedByte', 'UnsignedInt', 'UnsignedLong', 'UnsignedShort',
  'URI', 'URL', 'UUID']);

const words = (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean);
const pascal = (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const camel = (s) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };

const TYPE = [
  [['int', 'bigint', 'smallint', 'tinyint'], 'int', 'number'],
  [['decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'], 'decimal', 'number'],
  [['bit'], 'boolean', 'boolean'],
  [['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'time'], 'date', 'Date'],
  [['uniqueidentifier'], 'uuid', 'string'],
  [['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'], 'text', 'string'],
];
const IMPORT_ORDER = ['boolean', 'date', 'decimal', 'int', 'text', 'uuid', 'one', 'many'];
const warnings = [];

const tables = meta.schemas.flatMap((s) => s.tables.map((t) => ({ ...t, schemaName: s.schemaName })))
  .filter((t) => selectors.some((sel) => t.tableName === sel || (sel.endsWith('_') && t.tableName.startsWith(sel))));
if (tables.length === 0) {
  console.error(`No tables in ${dir}/metadata.json match ${selectors.join(', ')}`);
  process.exit(1);
}

const classes = [];
for (const t of tables) {
  let cls = pascal(t.tableName);
  if (RESERVED.has(cls)) { cls += 'Record'; warnings.push(`Renamed ${t.tableName} -> ${cls} (reserved GraphQL name).`); }
  const pk = t.primaryKeyColumns ?? [];
  if (pk.length === 0) warnings.push(`No PK metadata available for ${t.tableName}; generated as a keyless entity.`);
  if (!(t.foreignKeys?.length)) warnings.push(`No FK metadata available for ${t.tableName}; relationships omitted.`);

  const used = new Set();
  const props = t.columns.map((c) => {
    const hit = TYPE.find(([sql]) => sql.includes(String(c.dataType).toLowerCase()));
    const [dec, ts] = hit ? [hit[1], hit[2]] : ['text', 'string'];
    if (!hit) warnings.push(`Unknown SQL type ${c.dataType} for ${t.tableName}.${c.columnName}; falling back to @text().`);
    used.add(dec);
    const prop = camel(c.columnName);
    const opts = [];
    if (c.isNullable) opts.push('optional: true');
    if (prop !== c.columnName) opts.push(`column: '${c.columnName.replace(/'/g, "\\'")}'`);
    if (dec === 'text' && c.maxLength > 0) opts.push(`max: ${c.maxLength}`);
    if (dec === 'decimal' && c.precision != null && c.scale != null) opts.push(`precision: ${c.precision}`, `scale: ${c.scale}`);
    return `  @${dec}(${opts.length ? `{ ${opts.join(', ')} }` : ''}) ${prop}${c.isNullable ? '?' : '!'}: ${ts};`;
  });
  const pkProps = pk.map((col) => camel(col));

  const src = [
    `import { ${['entity', ...IMPORT_ORDER.filter((d) => used.has(d))].join(', ')} } from '@microsoft/rayfin-core';`,
    `import { Source } from '@microsoft/rayfin-connectors';`,
    ``,
    `// Generated from metadata.json (${t.schemaName}.${t.tableName}) by scripts/generate-connector-entities.mjs.`,
    `@entity()`,
    `export class ${cls} extends Source({ schema: '${t.schemaName}', table: '${t.tableName}', primaryKey: [${pkProps.map((p) => `'${p}'`).join(', ')}] }) {`,
    ...props,
    `}`,
    ``,
  ].join('\n');
  writeFileSync(join(dir, `${cls}.ts`), src);
  classes.push(cls);
}

const schemaName = `${pascal(connector)}Schema`;
const aggregate = [
  `import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';`,
  `import type { ConnectorConfig } from '@microsoft/rayfin-connectors';`,
  ``,
  ...classes.map((c) => `import { ${c} } from './${c}.js';`),
  ``,
  ...classes.map((c) => `export { ${c} } from './${c}.js';`),
  ``,
  `export const connectorConfig = {`,
  `  connector: '${meta.connector}',`,
  `  operations: ['read'],`,
  `  entities: { ${classes.join(', ')} },`,
  `} as const satisfies ConnectorConfig;`,
  ``,
  `export type ${schemaName} = GraphQLBackedConnector<`,
  `  { ${classes.map((c) => `${c}: typeof ${c}`).join('; ')} },`,
  `  typeof connectorConfig`,
  `>;`,
  ``,
].join('\n');
writeFileSync(join(dir, 'schema.ts'), aggregate);

console.log(`Generated ${classes.length} entities in ${dir}: ${classes.join(', ')}`);
for (const w of warnings) console.warn(`warning: ${w}`);
