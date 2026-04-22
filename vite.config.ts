import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          if (id.includes("victory-vendor") || id.includes("/d3-")) {
            return "charts-vendor";
          }

          if (id.includes("framer-motion")) {
            return "motion";
          }

          if (id.includes("@radix-ui")) {
            return "radix";
          }

          if (
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("date-fns") ||
            id.includes("dompurify") ||
            id.includes("lucide-react") ||
            id.includes("marked") ||
            id.includes("tailwind-merge")
          ) {
            return "utils";
          }

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
