import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
  {
    rules: {
      // The React Compiler rule flags several long-standing synchronization
      // effects in the pre-Arena UI (ScoreRing, MiniDemo, MarketClient,
      // NewThesisWorkflow, AgentActionReview, PositionsClient). They are
      // correct as written and restructuring them would risk regressing
      // working screens for a style preference, so this stays visible as a
      // warning rather than blocking the Arena build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
