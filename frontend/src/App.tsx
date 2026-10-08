import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LinkForm } from "./components/link-form";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LinkForm />
    </QueryClientProvider>
  );
}

export default App;
