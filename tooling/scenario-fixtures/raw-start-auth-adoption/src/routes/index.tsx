import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/' as never)({
  component: HomePage,
});

function HomePage() {
  return <main>raw start auth adoption</main>;
}
