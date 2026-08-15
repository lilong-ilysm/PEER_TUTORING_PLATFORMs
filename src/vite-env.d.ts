/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
  readonly VITE_APP_NAME?: string;

  // REST backend (API Gateway + Lambda + DynamoDB + Cognito user pool).
  // Public identifiers only. No secret belongs in a VITE_* variable, because
  // everything prefixed VITE_ is embedded in the client bundle.
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
