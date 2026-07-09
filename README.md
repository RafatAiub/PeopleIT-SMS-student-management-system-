# PeopleIT Student Management System (SMS) 🚀

Welcome to **PeopleIT SMS**! This repository houses a state-of-the-art, multi-tenant Student Management System (SaaS) designed to streamline academic, administrative, and financial workflows for institutions. It features robust role-based access control, advanced scheduling, automated results processing, and built-in AI analytics dashboards.

This document serves as the master guide for any developer joining the project.

---

## 🏛️ System Diagrams & Platform Architecture

To help developers understand the core mechanics, data flows, and lifecycles of PeopleIT SMS, we document the system using standard architecture diagrams below.

### 1. System Context & C4 Container Diagram
This container diagram illustrates the full high-level deployment stack of the SaaS application:

```mermaid
flowchart TB
    user[User: Super Admin, School Admin, Teacher, Student, Guardian]
    
    subgraph ClientContainer [Client Container - User's Browser]
        spa[React Single Page Application / Tailwind CSS]
    end
    
    subgraph ServerContainer [Server Container - Render.com Cloud Platform]
        api[Express REST API: Node.js / TypeScript App]
    end
    
    subgraph DataStorageContainer [Database & Caching Layer]
        db[(PostgreSQL: Neon Serverless Database)]
        redis[(Redis Cache: Upstash Redis Server)]
    end
    
    user -->|Interacts with UI| spa
    spa -->|JSON REST HTTPS requests| api
    api -->|Session token validation & rate limiting| redis
    api -->|Multi-tenant SQL queries via Prisma| db
```

---

### 2. Sequence Diagram (Authentication & Tenant Verification Flow)
This diagram illustrates the sequence of actions that occur when a user signs in, verifying their credentials and tenant constraints:

```mermaid
sequenceDiagram
    autonumber
    actor User as User/Client
    participant FE as React Frontend
    participant BE as Express Backend
    participant Redis as Redis Cache
    participant DB as PostgreSQL (Prisma)

    User->>FE: Input credentials & submit Login Form
    Note over FE: Email/password trimmed. If Super Admin,<br/>Institution Code is omitted.
    FE->>BE: POST /api/v1/auth/login
    
    Note over BE: Rate Limit Middleware checks IP
    BE->>Redis: Check request limit rate
    Redis-->>BE: Limit OK

    Note over BE: Validate request body via Zod LoginDto
    BE->>DB: Query User (filter by email & role / institution)
    DB-->>BE: Return User (hash, plainPassword, active status)
    
    Note over BE: Bcrypt verifies password hash
    BE->>DB: Store hashed Refresh Token
    DB-->>BE: Token stored
    
    BE-->>FE: 200 OK (JWT Access Token + Refresh Token Cookie)
    FE-->>User: Redirect to Role-based Dashboard
```

---

### 3. Entity-Relationship Diagram (Database ERD & Tenant Isolation)
The database is structured to support multi-tenancy. Every transaction and core record is isolated via `institutionId` to ensure total data containment:

```mermaid
erDiagram
    Institution {
        String id PK
        String name
        String slug UK "EIIN Code"
        Boolean isActive
        DateTime createdAt
    }
    Branch {
        String id PK
        String institutionId FK
        String name
        Boolean isActive
    }
    User {
        String id PK
        String institutionId FK "Optional"
        String email UK
        String passwordHash
        String plainPassword "Optional"
        UserRole role
        String firstName
        String lastName
        Boolean isActive
    }
    Student {
        String id PK
        String institutionId FK
        String branchId FK
        String classId FK
        String sectionId FK
        String userId FK "Optional"
        String studentId "Admissions No"
        String rollNumber
        String firstName
        String lastName
        String status "ACTIVE, INACTIVE..."
    }
    Teacher {
        String id PK
        String userId FK
        String qualification
        String subjectExpertise
    }
    Invoice {
        String id PK
        String institutionId FK
        String studentId FK
        String invoiceNo UK
        Decimal totalAmount
        Decimal paidAmount
        Decimal dueAmount
        String status "UNPAID, PAID, PARTIAL..."
    }
    AcademicClass {
        String id PK
        String branchId FK
        String name
        Int level
    }
    Section {
        String id PK
        String classId FK
        String name
        String classTeacherId FK
    }
    Attendance {
        String id PK
        String studentId FK
        DateTime date
        String status "PRESENT, ABSENT, LATE..."
    }
    ExamResult {
        String id PK
        String studentId FK
        String examId FK
        String subject
        Decimal marksObtained
    }
    Notice {
        String id PK
        String title
        String content
        String audience
    }

    Institution ||--o{ Branch : "has"
    Institution ||--o{ User : "contains"
    Institution ||--o{ Student : "contains"
    Institution ||--o{ Invoice : "issues"
    Institution ||--o{ Notice : "publishes"

    Branch ||--o{ AcademicClass : "has"
    AcademicClass ||--o{ Section : "has"

    User ||--o| Student : "links to"
    User ||--o| Teacher : "links to"
    
    Student ||--o{ Invoice : "billed for"
    Student ||--o{ Attendance : "logs"
    Student ||--o{ ExamResult : "scores"
    
    Teacher ||--o{ Section : "manages"
```

---

### 4. Role Permission Access Matrix
PeopleIT SMS enforces a strict role hierarchy to control API endpoints and view scopes:

```mermaid
graph TD
    SuperAdmin[Global Super Admin] -->|Manages| Institutions[Institutions / Tenants]
    Institutions -->|Administered by| SchoolAdmin[School Admin]
    SchoolAdmin -->|Manages| Users[Users & Academics]
    
    subgraph Roles [Tenant Roles]
        SchoolAdmin --> Teacher[Teacher]
        SchoolAdmin --> Accountant[Accountant]
        SchoolAdmin --> Librarian[Librarian]
        SchoolAdmin --> Transport[Transport Officer]
        
        Teacher --> Student[Student]
        Teacher --> Guardian[Guardian]
    end
```

| Resource | Global Super Admin | School Admin | Teacher | Accountant | Student / Guardian |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Institutions (Tenants)** | Read / Write / Delete | Read Only | No Access | No Access | No Access |
| **Branches & Classes** | No Access | Read / Write / Delete | Read Only | Read Only | Read Only |
| **User Accounts** | Read / Write (Admin Only) | Read / Write / Delete | Read Only | Read Only | No Access |
| **Student Profiles** | No Access | Read / Write / Delete | Read / Write | Read Only | Read (Own Only) |
| **Attendance Records** | No Access | Read / Write / Delete | Read / Write | Read Only | Read (Own Only) |
| **Exam Marks & Grades** | No Access | Read / Write / Delete | Read / Write | No Access | Read (Own Only) |
| **Invoices & Payments** | No Access | Read / Write / Delete | No Access | Read / Write | Read / Pay (Own Only) |
| **SaaS Billing & Logs** | Read / Write | No Access | No Access | No Access | No Access |

---

### 5. Status & Transition State Diagrams
Understanding entity transitions is critical for features like payment processing and student registration lifecycle:

```mermaid
stateDiagram-v2
    state "Invoice Lifecycle" as IL {
        [*] --> UNPAID : Invoice Generated
        UNPAID --> PARTIAL : Partial Payment Received
        UNPAID --> PAID : Full Payment Received
        UNPAID --> OVERDUE : Due Date Passed
        
        PARTIAL --> PAID : Remaining Balance Paid
        PARTIAL --> OVERDUE : Due Date Passed (Underpaid)
        
        OVERDUE --> PAID : Late Payment Received
        OVERDUE --> CANCELLED : Voided by Admin
        UNPAID --> CANCELLED : Voided by Admin
        
        PAID --> [*]
        CANCELLED --> [*]
    }
    
    state "Student Enrollment Lifecycle" as SL {
        [*] --> ADMITTED : Registration
        ADMITTED --> ACTIVE : Fees Cleared & Enrolled
        ACTIVE --> SUSPENDED : Violation / Fees Unpaid
        SUSPENDED --> ACTIVE : Re-instated
        ACTIVE --> GRADUATED : Academic Term Completed
        ACTIVE --> TRANSFERRED : Left Institution
        
        GRADUATED --> [*]
        TRANSFERRED --> [*]
    }
```

---

## 🏛️ Technology Stack Summary

---

## 📁 Codebase Structure

Understanding the layout of this monorepo is key to coding productively.

### Monorepo Overview
```bash
SMS/
├── backend/            # Express API codebase
├── frontend/           # React dashboard UI codebase
├── docker-compose.yml  # Docker environment for local Postgres & Redis
├── .env.example        # Reference environment variables
└── README.md           # You are here
```

---

### 📦 1. Backend Architecture (`/backend`)
We use a modular architecture. Instead of separating files by "controllers" or "routes", we group them strictly by **Business Domain Modules** under `src/modules/`.

```bash
backend/
├── prisma/
│   ├── schema.prisma   # Single source of truth database schema
│   └── seed.ts         # Seed script containing default institution, users, and classes
├── src/
│   ├── config/         # Environment setup, database connections, logger configuration
│   ├── middleware/     # Global middlewares (authenticate, setTenant, validate, requireRole)
│   ├── modules/        # Business Domains
│   │   ├── auth/       # Login, token rotation, logout
│   │   ├── timetables/ # Schedule management with automatic conflict checks
│   │   ├── attendance/ # Student attendance entries
│   │   ├── results/    # Excel uploads, grade sheets, transcript generation
│   │   ├── ai/         # Risk scoring, dashboard insights generator
│   │   └── users/      # Accounts & profile configurations
│   ├── utils/          # Standardized response wrappers, app errors
│   └── app.ts          # Server entry point
```

#### 🛡️ Standard Module Structure
Every module inside `src/modules/` is self-contained and consists of:
1. `*.dto.ts`: Zod schemas validating request body, query params, or URL path parameters.
2. `*.repository.ts`: Direct database interaction via Prisma (Strictly isolates queries).
3. `*.service.ts`: Business logic, permissions, validation checks, and data mapping.
4. `*.controller.ts`: HTTP request/response handler mapping inputs to Services.
5. `*.routes.ts`: Express routes defining endpoint patterns, middlewares, and controllers.

---

### 🎨 2. Frontend Architecture (`/frontend`)
The frontend is a modern SPA designed around a premium dark glassmorphism aesthetic.

```bash
frontend/
├── src/
│   ├── api/            # Axios API client (client.ts) and endpoints mapping (auth.api.ts)
│   ├── components/     # Globally reusable design system units (sidebar, UI components)
│   ├── hooks/          # React hooks managing query mutations and Auth wrapper
│   ├── pages/          # Full page views
│   │   ├── timetables/ # Interactive weekly grid routine
│   │   ├── results/    # Excel smart upload and grading panel
│   │   ├── ai/         # Executive AI insights and student risk analysis
│   │   └── Login.tsx   # Secured multi-role login interface
│   ├── store/          # Zustand authentication & theme configurations (authStore.ts)
│   ├── App.tsx         # Root component & Route management
│   └── main.tsx        # React entrypoint
```

---

## ⚙️ Local Development Setup

To get the project up and running locally, follow these steps:

### 1. Prerequisite Environment
Ensure you have **Node.js (v18+)** and **Docker Desktop** installed.

### 2. Set Up Environment Variables
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` is pointing to `localhost:5432` and `REDIS_URL` is pointing to `localhost:6379`.

### 3. Spin Up Local Services (Postgres & Redis)
Use Docker Compose to launch database and cache containers in the background:
```bash
docker compose up -d
```

### 4. Setup Backend
```bash
cd backend
npm install

# Run database migrations
npx prisma migrate dev

# Seed database with mock institutions, classes, and users
npx prisma db seed

# Start Express server in development mode
npm run dev
```

### 5. Setup Frontend
In a new terminal window:
```bash
cd ../frontend
npm install

# Start Vite dev server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👥 Demo Logins
Once seeded, the database contains default accounts with the password **`admin123`**:
- **Super Admin:** `admin@peopleit.com` (Direct login, no institution code needed)
- **School Admin:** `schooladmin@peopleit.com` (EIIN / Institution Code: `102030`)
- **Teacher:** `teacher@peopleit.com` (EIIN: `102030`)
- **Student:** `student@peopleit.com` (EIIN: `102030`)

---

## 🛡️ Coding Best Practices

### 1. Multi-Tenant Isolation
This is a SaaS application. Every record in the database is tied to an `institutionId` (except for Super Admins).
- **Rule:** Never query tables directly without checking tenant isolation. 
- **Implementation:** The `setTenant` middleware automatically extracts the tenant ID from the authenticated user session and injects it into `req.tenantId`. All queries in repositories must explicitly include and filter by `institutionId`.

### 2. Standardized Response Format
Always use the response utilities located in `backend/src/utils/response.ts`.
- **Success:** `successResponse(res, data, 'Message', 200)`
- **Paginated:** `paginatedResponse(res, dataArray, totalCount, page, pageSize, 'Success')`
- **Errors:** Handled automatically by passing the error to Express `next(error)`. The error middleware will format it standardly.

### 3. TypeScript Type Safety
Never use `any` unless absolutely necessary.
- Build Zod schemas inside `*.dto.ts`.
- Infer TypeScript types using `z.infer<typeof Schema>` and export them.
- Always run `npx tsc --noEmit` before opening a pull request to verify no type-check regressions exist.

---

## 🚢 Deploying to Production
For full details, read our Managed Services Deployment Guide.
- **Frontend** compiles using `npm run build` and is deployed to **Vercel**.
- **Backend** compiles using `npm run build` and runs via `npm start` on **Render.com**.
- **Database** is hosted on **Neon.tech** or **Supabase**.
- **Cache** runs on **Upstash Redis**.
