import { UserDataFunctions } from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

// Placeholder while the functions service is disabled. The in-app Q&A function lives on the
// qa-claude-wip branch until the ANTHROPIC_API_KEY secret is set.
udf.func(
  'helloWorld',
  (firstName: string, lastName: string): string =>
    `Hello ${firstName} ${lastName}!`,
  []
);
