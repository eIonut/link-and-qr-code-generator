import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./App.css";
import { Button } from "./components/ui/button";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Button>Hello</Button>
    </QueryClientProvider>
  );
}

export default App;
