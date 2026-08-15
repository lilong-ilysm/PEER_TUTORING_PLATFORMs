/**
 * DynamoDB access for the PeerLearn API Lambda.
 *
 * Thin helpers only. All business logic lives in `shared/domain/rules.ts`, which
 * this Lambda imports unchanged — the same module the browser and the original
 * Amplify handler use. That is what keeps the three deployment targets honest
 * about what is and is not allowed.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    // Empty strings are legal in DynamoDB now, but undefined is not; stripping
    // them keeps optional fields from blowing up a write.
    removeUndefinedValues: true,
  },
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Check infra/peerlearn.yaml.`);
  }
  return value;
}

export const TABLES = {
  users: requiredEnv('TABLE_USERS'),
  tutorProfiles: requiredEnv('TABLE_TUTOR_PROFILES'),
  slots: requiredEnv('TABLE_SLOTS'),
  sessions: requiredEnv('TABLE_SESSIONS'),
  reviews: requiredEnv('TABLE_REVIEWS'),
  messages: requiredEnv('TABLE_MESSAGES'),
  notifications: requiredEnv('TABLE_NOTIFICATIONS'),
} as const;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export async function getItem<T>(table: string, id: string): Promise<T | null> {
  const result = await ddb.send(new GetCommand({ TableName: table, Key: { id } }));
  return (result.Item as T | undefined) ?? null;
}

export async function putItem<T extends Record<string, unknown>>(
  table: string,
  item: T,
): Promise<T> {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}

export async function deleteItem(table: string, id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { id } }));
}

/** Pages a query to completion. Result sets here are small by design. */
export async function queryAll<T>(input: QueryCommandInput): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  let guard = 0;

  do {
    const result = await ddb.send(
      new QueryCommand({ ...input, ExclusiveStartKey: startKey }),
    );
    items.push(...((result.Items ?? []) as T[]));
    startKey = result.LastEvaluatedKey;
    guard += 1;
  } while (startKey && guard < 25);

  return items;
}

/** Sets or removes attributes in one call. `null` removes. */
export async function patchItem<T>(
  table: string,
  id: string,
  changes: Record<string, unknown>,
): Promise<T> {
  const setEntries = Object.entries(changes).filter(([, value]) => value !== undefined);

  const sets: string[] = [];
  const removes: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  setEntries.forEach(([key, value], index) => {
    const nameKey = `#n${index}`;
    names[nameKey] = key;

    if (value === null) {
      removes.push(nameKey);
    } else {
      const valueKey = `:v${index}`;
      values[valueKey] = value;
      sets.push(`${nameKey} = ${valueKey}`);
    }
  });

  const clauses: string[] = [];
  if (sets.length > 0) clauses.push(`SET ${sets.join(', ')}`);
  if (removes.length > 0) clauses.push(`REMOVE ${removes.join(', ')}`);

  if (clauses.length === 0) {
    const existing = await getItem<T>(table, id);
    if (!existing) throw new Error('Nothing to update and the item does not exist.');
    return existing;
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { id },
      UpdateExpression: clauses.join(' '),
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as T;
}

export { UpdateCommand };
