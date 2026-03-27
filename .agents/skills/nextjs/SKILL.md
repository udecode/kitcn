---
name: nextjs
description: Next.js routing with typed routes, PageProps, LayoutProps helpers, and nuqs for URL state. Use for pages, layouts, navigation, and query parameters.
---

# Next.js Routing & Navigation

## Requirements

### Route Props Helpers (Next.js 15.5+)

- Use globally available `PageProps`, `LayoutProps`, `RouteContext` types - no imports needed
- **RouteContext**: Use for typing route handler context parameters with proper type inference
- **PageProps**: Use for page components with typed params and searchParams
- **LayoutProps**: Use for layout components with children and parallel route slots
- Automatically includes typed params, searchParams, children, and parallel route slots
- Always await Promise-based params and searchParams

### Typed Routes (Next.js 15.5+)

- TypeScript will catch invalid routes in `<Link>` components at compile time
- Automatically generates types based on your file structure
- Use `Route` type for props
- Use `as Route` for non-literal strings (e.g., `('/blog' + slug) as Route`)

### Custom Param Hooks

- **NEVER use useParams from Next.js directly** - use typed alternatives from `@/hooks/use-params`
- **Use unique param names** (e.g., `[userId]` not `[id]`) for better type inference
- **useTParams<Route>()**: For specific app routes with exact typing
- **useLayoutParams()**: For layout components, returns all params as optional
- **useLayoutParams<Route>()**: For layout components with route prefix, exact route params required + prefix params optional

### URL Query State

- **NEVER use useSearchParams from Next.js** - always use nuqs for URL query state
- Use appropriate parsers based on parameter data type
- Configure history mode and clearOnDefault
- Handle URL updates with void to prevent promise-related linting issues

## Examples

<example>
// Page component with PageProps
export default async function Page(props: PageProps<'/products/[category]/[id]'>) {
  const { category, id } = await props.params;
  const searchParams = await props.searchParams;
  
  return (
    <div>
      <h1>Product: {id}</h1>
      <p>Category: {category}</p>
    </div>
  );
}
</example>

<example>
// Layout with parallel routes
export default function DashboardLayout(props: LayoutProps<'/dashboard'>) {
  return (
    <div className="dashboard">
      <aside>{props.sidebar}</aside> {/* Typed parallel route */}
      <main>{props.children}</main>
      <div>{props.analytics}</div> {/* Typed parallel route */}
    </div>
  );
}
</example>

<example>
// Route handler with RouteContext (recommended)
export async function GET(
  request: Request,
  ctx: RouteContext<'/api/posts/[slug]'>
) {
  const { slug } = await ctx.params;
  return Response.json({ slug });
}

// Multiple parameters
export async function DELETE(
request: Request,
ctx: RouteContext<'/api/users/[id]/posts/[postId]'>
) {
const { id, postId } = await ctx.params;
return Response.json({ userId: id, postId });
}

// Optional parameters
export async function PUT(
request: Request,
ctx: RouteContext<'/api/categories/[[...slug]]'>
) {
const { slug } = await ctx.params; // slug: string[] | undefined
return Response.json({ segments: slug });
}
</example>

<example>
// URL Query State with nuqs
export const useFilterState = () => {
  return useQueryState(
    'filter',
    parseAsStringEnum(['all', 'active', 'completed'])
      .withDefault('all')
      .withOptions({ history: 'push', clearOnDefault: true })
  );
};

// Usage
const [filter, setFilter] = useFilterState();
void setFilter('active');
</example>

<example>
// Enable Typed Routes in next.config.ts
const nextConfig = {
  typedRoutes: true, // Compile-time type safety for routes
};
export default nextConfig;

// Usage in components
import Link from 'next/link';

// ✅ Type-safe links

<Link href="/patients/123">View Patient</Link>
<Link href="/library/dx-tx?category=cardiology">Browse Library</Link>

// ✅ Non-literal strings with Route type
const slug = 'nextjs';

<Link href={('/blog/' + slug) as Route}>Blog Post</Link>
router.push(('/blog/' + slug) as Route);

// ❌ TypeScript will catch invalid routes at compile time

<Link href="/invalid-route">Broken Link</Link> // ← Type error
</example>

<example>
// Custom Param Hooks Usage
import { useTParams, useLayoutParams } from '@/hooks/use-params';

// ✅ For specific routes with exact typing
const PatientPage = () => {
const params = useTParams<'/patients/[patientId]'>();
params.patientId; // string - guaranteed to exist
};

// ✅ For layouts - all params optional
const RootLayout = ({ children }) => {
const params = useLayoutParams();
params.patientId; // string | undefined
params.complaintId; // string | undefined
};

// ✅ For layouts with route prefix - exact + optional
const ComplaintLayout = ({ children }) => {
const params = useLayoutParams<'/complaints/[complaintId]'>();
params.complaintId; // string - required for exact match
params.someOtherParam; // string | undefined - from related routes
};
</example>

<example type="invalid">
// ❌ Don't use manual typing for route handlers
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return Response.json({ slug });
}

// ❌ Don't use manual typing for page props
interface Props {
params: Promise<{ slug: string }>;
children: React.ReactNode;
}

// ❌ Don't use raw useParams - use typed alternatives
import { useParams } from 'next/navigation';
const params = useParams();

// ❌ Don't use useSearchParams
import { useSearchParams } from 'next/navigation';
const searchParams = useSearchParams();

// ❌ Don't use string concatenation for routes
router.push(`/patients/${id}`); // Use typed routes instead
</example>
