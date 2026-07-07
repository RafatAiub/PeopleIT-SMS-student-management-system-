# Skill: React 19 State Management & Custom Hooks

## State Architecture

```
Global Client State   → Zustand stores (auth, ui, notifications)
Server / Remote State → TanStack Query (React Query v5)
URL State             → React Router searchParams
Local Component State → useState / useReducer
Form State            → React Hook Form + Zod resolver
```

---

## Zustand Rules

### ✅ One store per domain, not one giant store

```typescript
// store/authStore.ts
interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      tenantId: null,
      setAuth: (user, token) => set({ user, token, tenantId: user.institutionId }),
      clearAuth: () => set({ user: null, token: null, tenantId: null }),
    }),
    { name: 'sms-auth' }
  )
);
```

### ✅ Use selectors to prevent re-renders

```typescript
// ❌ WRONG — subscribes to entire store
const { user, token, tenantId } = useAuthStore();

// ✅ CORRECT — only re-renders when user changes
const user = useAuthStore((state) => state.user);
```

---

## React Query Rules

### ✅ Define query keys as typed constants

```typescript
// api/queryKeys.ts
export const studentKeys = {
  all: (tenantId: string) => ['students', tenantId] as const,
  list: (tenantId: string, filters: StudentFilters) => ['students', tenantId, 'list', filters] as const,
  detail: (tenantId: string, id: string) => ['students', tenantId, 'detail', id] as const,
};
```

### ✅ Custom hook per entity

```typescript
// hooks/useStudents.ts
export function useStudents(filters: StudentFilters) {
  const tenantId = useAuthStore((s) => s.tenantId!);
  return useQuery({
    queryKey: studentKeys.list(tenantId, filters),
    queryFn: () => studentsApi.list(filters),
    staleTime: 30_000, // 30 seconds
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((s) => s.tenantId!);
  return useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all(tenantId) });
    },
  });
}
```

---

## Prop-Drilling Rules

> [!IMPORTANT]
> No prop-drilling beyond 2 component levels. Use Zustand or React Query instead.

```typescript
// ❌ WRONG — drilling tenantId through 3 levels
<Page tenantId={tenantId}>
  <Section tenantId={tenantId}>
    <Widget tenantId={tenantId} />
  </Section>
</Page>

// ✅ CORRECT — widget reads from store directly
const tenantId = useAuthStore((s) => s.tenantId);
```

---

## Performance Patterns

- **Code splitting**: Every page-level component wrapped in `React.lazy()` + `Suspense`
- **Memoization**: Use `useMemo` for expensive derived data, `useCallback` for handlers passed to children
- **Virtualization**: Use `@tanstack/react-virtual` for lists with > 100 items (student lists, etc.)
- **Optimistic updates**: Apply for UI-critical mutations (attendance toggle, fee payment)
