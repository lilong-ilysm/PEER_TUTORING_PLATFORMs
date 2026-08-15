# Deploying PeerLearn in AWS Academy Learner Lab

**Status:** written, locally verified, **not yet deployed**. No AWS resource has been
created by this document's author. Every mutating command below is for you to run.

---

## 1. Why the original architecture could not be deployed

The project was first built on **AWS Amplify Gen 2** (that code is still in
`amplify/`). It cannot be deployed in an AWS Academy Learner Lab.

The Learner Lab denies `iam:CreateRole` with an **explicit deny** in the policy
`Pvoclabs2`. An explicit deny cannot be overridden by any allow, at any level.

Evidence gathered:

```
User: arn:aws:sts::861601949054:assumed-role/voclabs/user5318787=...
is not authorized to perform: iam:CreateRole on resource:
arn:aws:iam::861601949054:role/cdk-hnb659fds-lookup-role-861601949054-us-east-1
```

```
$ aws iam get-role --role-name voclabs
AccessDenied ... with an explicit deny in an identity-based policy:
arn:aws:iam::861601949054:policy/Pvoclabs2
```

```
$ aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --region us-east-1
ParameterNotFound          <- bootstrap never completed
```

Amplify Gen 2 needs role creation in **three independent places**, so fixing any one
of them would not have helped:

| # | What needs a role | Avoidable? |
|---|---|---|
| 1 | CDK bootstrap roles (`cdk-hnb659fds-*`) | Yes — a custom bootstrap template can omit them |
| 2 | The Amplify Hosting **service role** for Gen 2 backend builds | **No** |
| 3 | The backend stack itself | **No** |

Blocker 3 is decisive. Amplify Gen 2's `defineAuth` always provisions a Cognito
**Identity Pool**, and an identity pool cannot exist without authenticated and
unauthenticated IAM roles. The backend also needs a Lambda execution role and
AppSync service roles. None of that is configurable away.

**`Stack [CDKToolkit] already exists` was a symptom, not the cause.** The bootstrap
failed on `iam:CreateRole`, CloudFormation rolled back, and the stack settled in
`ROLLBACK_COMPLETE` — a state that permits only deletion, which is why later
attempts reported "already exists" instead of retrying.

**The `CDKToolkit` stack is left in place deliberately.** It holds no resources
(rollback removed them), it costs nothing, and deleting it would not help because
re-bootstrapping would fail identically.

### What was *not* the problem

React, TypeScript, Vite, Tailwind, the application logic and `amplify.yml` were all
correct throughout. `tsc` was clean, `vite build` succeeded, and 84 tests passed
before and after this change.

## 2. What replaced it

```
Student / Tutor (browser)
        |
        v
AWS Amplify Hosting  ....... React 18 + TS + Vite, manual deployment of dist/
        |
        |  HTTPS, Cognito ID token in the Authorization header
        v
Amazon API Gateway  ........ REST, Cognito User Pool authorizer
        |                    /public/*  unauthenticated
        |                    /api/*     authenticated
        v
AWS Lambda  ................ one function, internal router
        |                    execution role = existing LabRole (PASSED)
        |                    imports shared/domain/rules.ts unchanged
        v
Amazon DynamoDB  ........... 7 tables

Amazon Cognito User Pool ... registration, login, JWT
                            NO identity pool -> no IAM roles
```

**IAM roles created: zero. IAM roles reused: one (`LabRole`).**

Confirmed available in this account by direct probe: Amplify (2 apps already
deployed successfully), API Gateway, Cognito, DynamoDB, Lambda. `LabRole` confirmed
present via `aws iam list-roles`.

### Why the application barely changed

The backend already sat behind a single interface, `src/lib/api/contract.ts`. There
were two implementations; this added a third. Untouched: every component, every page,
both React contexts, `shared/domain/*`, and all 84 tests.

Design decisions carried over intact:

- **Server-enforced rules.** The Lambda imports `shared/domain/rules.ts` — the same
  module the browser uses — so the state machine, booking preconditions and review
  eligibility are unchanged.
- **Atomic booking.** The DynamoDB conditional write in `claimSlot()` replaces the
  Amplify version's conditional write. Same technique, same guarantee: two
  simultaneous bookings cannot both succeed.
- **No private data on public endpoints.** `/public/*` serves tutor profiles,
  availability and reviews. Email addresses live only on the `Users` table, which no
  public route reads.
- **Discoverability enforced by storage.** `publishedFlag` is written only when a
  profile is genuinely discoverable, and the `byPublished` index is sparse, so a
  half-configured tutor cannot appear in search.

---

## 3. Deployment

Run everything in **CloudShell** or a terminal with Learner Lab credentials, in
**`us-east-1`**.

### Step 0 — Validate the template (READ-ONLY)

```bash
aws cloudformation validate-template \
  --template-body file://infra/peerlearn.yaml \
  --region us-east-1
```

Confirms the template parses. Creates nothing.

### Step 1 — Deploy the backend (MUTATING)

Creates a Cognito user pool, 7 DynamoDB tables, 1 Lambda, and an API Gateway REST
API. **Note the absence of `--capabilities`:** this template declares no IAM
resources, so CloudFormation does not need that acknowledgement. If it ever asks for
`CAPABILITY_IAM`, stop — something has been added that Learner Lab will reject.

```bash
aws cloudformation deploy \
  --template-file infra/peerlearn.yaml \
  --stack-name peerlearn \
  --region us-east-1 \
  --parameter-overrides LabRoleArn=arn:aws:iam::861601949054:role/LabRole
```

If it fails, read the cause (READ-ONLY):

```bash
aws cloudformation describe-stack-events --stack-name peerlearn --region us-east-1 \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
  --output table
```

### Step 2 — Read the outputs (READ-ONLY)

```bash
aws cloudformation describe-stacks --stack-name peerlearn --region us-east-1 \
  --query 'Stacks[0].Outputs' --output table
```

Gives you `ApiBaseUrl`, `UserPoolId`, `UserPoolClientId`, `LambdaFunctionName`.

### Step 3 — Upload the real Lambda code (MUTATING)

The stack ships a placeholder handler, because CloudFormation caps inline code at
4096 characters and the real router is much larger.

```bash
npm install
npm run package:lambda
npm run deploy:lambda -- --stack peerlearn --region us-east-1
```

This replaces one function's code. It touches nothing else and never touches IAM.

Verify (READ-ONLY):

```bash
curl -s "<ApiBaseUrl>/public/tutors"
```

`[]` is the correct answer on a fresh database. `NOT_DEPLOYED` means step 3 did not
take effect.

### Step 4 — Build the frontend against the real backend

Create `.env` locally (it is gitignored):

```
VITE_DATA_MODE=rest
VITE_API_BASE_URL=<ApiBaseUrl from step 2>
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
```

```bash
npm run build
```

The amber "Demo data" banner must be **gone** from the built app. If it is still
there, one of the three variables is missing and the app fell back to demo mode.

### Step 5 — Create an Amplify app (MUTATING)

Two apps already exist in this account (`app6908`, `app5250`). **Leave them alone**
and create a new one:

```bash
aws amplify create-app --name peerlearn --region us-east-1 \
  --custom-rules '[{"source":"/<*>","target":"/index.html","status":"404-200"}]' \
  --query 'app.appId' --output text
```

The custom rule is the SPA rewrite. Without it, refreshing on `/tutors/abc` returns
404, because Amplify looks for a file at that path.

### Step 6 — Deploy the frontend (MUTATING)

```bash
npm run deploy:frontend -- --app-id <appId> --branch main --region us-east-1
```

Manual deployment is used deliberately: Amplify's Git-connected build for Gen 2
requires a service role, and creating one is exactly what the lab forbids. Manual
deployment needs no role.

Your site: `https://main.<appId>.amplifyapp.com`

### Step 7 — Tighten CORS (MUTATING, optional but recommended)

The stack defaults to `AllowedOrigin: '*'` because the Amplify domain is not known
until step 6. Once it is:

```bash
aws cloudformation deploy \
  --template-file infra/peerlearn.yaml \
  --stack-name peerlearn \
  --region us-east-1 \
  --parameter-overrides \
      LabRoleArn=arn:aws:iam::861601949054:role/LabRole \
      AllowedOrigin=https://main.<appId>.amplifyapp.com
```

---

## 4. Verifying it actually works

Do these in order. Each one proves something specific.

1. **`GET <ApiBaseUrl>/public/tutors` returns `[]`.** API Gateway, Lambda and
   DynamoDB are all wired, and `LabRole` has the permissions it needs.
2. **Register an account.** You should receive a real confirmation code by email.
   That proves Cognito is live. Demo mode has no such step.
3. **Register a second account as a tutor.** Complete the tutor profile, publish it,
   add availability.
4. **The tutor now appears in search.** Proves the sparse `byPublished` index and
   the discoverability rule.
5. **Book from the learner account, accept from the tutor account.** Proves the
   booking flow and the slot claim.
6. **Try to book the same slot again from a third account.** Must fail with a
   conflict message. This is the double-booking guarantee.
7. **Refresh the page on `/dashboard/sessions`.** Proves the SPA rewrite.

Failures surface in CloudWatch: log group `/aws/lambda/peerlearn-api`.

---

## 5. Known limitations, stated plainly

- **Search filters in the browser.** `/public/tutors` returns published tutors and
  the app filters client-side. Fine for a class-sized dataset; a large deployment
  would need server-side filtering.
- **API Gateway access logging is off.** Enabling it needs an account-level
  CloudWatch role, which the lab forbids. Lambda still logs normally.
- **`LabRole` is broad.** It is not least-privilege. That is a property of the lab
  environment, not a design choice, and worth saying so in a report.
- **Learner Lab sessions expire** and may reclaim resources. Redeploying is one
  `cloudformation deploy` plus one `deploy:lambda`, which is why this is a template
  rather than a sequence of console clicks.
- **Notifications are in-app only.** No email or push.
- **Meeting links cannot be edited after acceptance.**
- **The Amplify Gen 2 backend in `amplify/` remains undeployable here.** It is kept
  because it is correct, documented, and deployable in an unrestricted AWS account.

---

## 6. Teardown (MUTATING — destructive)

Removes the API, Lambda, user pool and **all data in the DynamoDB tables**.
Irreversible.

```bash
aws cloudformation delete-stack --stack-name peerlearn --region us-east-1
aws amplify delete-app --app-id <appId> --region us-east-1
```

Confirm afterwards (READ-ONLY):

```bash
aws cloudformation describe-stacks --stack-name peerlearn --region us-east-1
```

`ValidationError: Stack ... does not exist` means teardown finished. A partially
failed delete can leave DynamoDB tables behind, and those are what would keep
costing money, so check.
