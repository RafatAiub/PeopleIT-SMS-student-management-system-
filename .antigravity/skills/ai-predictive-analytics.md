# Skill: AI Insights & Risk Scoring Engine

## Rule Overview
This module governs how the application runs student academic risk scoring, generates AI dashboard insights, and interacts with LLMs/ML models. It ensures context safety, standardized prompt engineering, type-safe JSON response generation, and strict tenant isolation.

---

## Strict Tenant Isolation in AI Contexts

When constructing prompt payloads or sending data to external AI/ML APIs, you **MUST** ensure that data from one institution never leaks into the prompt or dataset context of another.

### ✅ REQUIRED — Build prompts from tenant-scoped queries only
Before constructing any context for an AI prompt (e.g., student attendance history, grade lists, or financial data), always query the database using the verified `institutionId` from the JWT. Never accept data queries from raw request inputs without filtering.

```typescript
// ✅ CORRECT — Tenant isolation strictly enforced on dataset query
export async function getDashboardInsights(institutionId: string) {
  const studentCount = await prisma.student.count({
    where: { institutionId, status: 'ACTIVE' },
  });
  
  // construct prompt using isolated database records...
}

// ❌ WRONG — Fetches all students or accepts student lists directly from body
export async function getRiskScoringWrong(reqBody: any) {
  // Vulnerability: studentIds are not checked for tenant ownership
  const students = await prisma.student.findMany({
    where: { id: { in: reqBody.studentIds } }
  });
}
```

### ✅ REQUIRED — Explicitly prefix system messages with Tenant metadata
For safety audit trails, inject the `institutionId` or institution slug as metadata within the system instructions or prompt context sent to the model.

```typescript
const systemPrompt = `You are an AI assistant for institution ID: ${institutionId}.
Analyze the student performance data under this specific school context only.
Do not reference any external institution datasets.`;
```

---

## Prompts & Pipeline Standardization

### ✅ REQUIRED — Separate prompt templates from execution logic
Do not hardcode raw, dynamic prompt templates inside controllers or services. Define structured prompt templates in a dedicated config or template file to ensure uniform formatting and parameter sanitization.

```typescript
// ✅ CORRECT — Standardized template helper with validation
import { renderPrompt } from './ai.prompts';

const prompt = renderPrompt('STUDENT_RISK_SUMMARY', {
  studentName: `${student.firstName} ${student.lastName}`,
  attendanceRate: attendanceRate.toFixed(1),
  averageMarks: averageMarks.toFixed(1),
});
```

### ✅ REQUIRED — Sanitize dynamic text inputs
Any user-generated or database text (such as teacher comments, guardian notes) embedded in prompts **MUST** be sanitized (e.g. escaping markdown, stripping line breaks or control characters) to prevent prompt injection.

```typescript
// ✅ CORRECT — Sanitize text input before embedding
const sanitizedComment = teacherComment.replace(/[{}]/g, '').trim();
```

---

## Structured JSON Outputs

To guarantee that the backend can parse model outputs reliably, always request structured JSON and validate the response schema.

### ✅ REQUIRED — Validate LLM output with Zod
Never assume the model output is well-formed. Parse the result and validate it against a Zod schema before using or persisting it.

```typescript
import { z } from 'zod';

const AiRiskOutputSchema = z.object({
  riskLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reason: z.string().min(1),
  recommendedAction: z.string().min(1),
});

// ✅ CORRECT — Validate the generated JSON response
const rawResponse = await callLlmEngine(prompt); // Returns string
const parsedData = AiRiskOutputSchema.parse(JSON.parse(rawResponse));
```

---

## Risk Scoring Calculation Rules

For academic risk scoring, use the following thresholds and standard rules:

| Risk Level | Trigger Criteria | Action Required |
|---|---|---|
| **HIGH** | Attendance < 75% OR has failing grades (D, F) | Immediate SMS/Push alert to guardian + flag for tutoring |
| **MEDIUM** | Attendance 75% to 79.9% OR grade average below C | Weekly review + flag for counseling |
| **LOW** | Attendance >= 80% AND grade average >= C | No immediate intervention |

---

## Prohibited Patterns

| Pattern | Reason |
|---|---|
| Sending raw PII (like national ID numbers or emails) in prompts | Compliance and security risk (GDPR/privacy leak) |
| Parsing LLM response with `JSON.parse` without Zod validation | Causes crash or database corruption if format shifts |
| Letting client control `institutionId` in AI requests | Cross-tenant data tampering vector |
| Reusing dynamic LLM contexts across different tenant requests | Context contamination and data leak |

---

## Testing Requirement

Every AI insights or risk scoring service test must:
1. Mock the LLM/ML model client calls so tests do not make real API requests or incur costs.
2. Assert that if the database contains records for Institution A, calling the AI service for Institution B does not fetch or include any details from Institution A.
3. Test schema validation error handling (verify how the system behaves when the model returns malformed JSON).
