/* @refresh reload */
import { render } from "solid-js/web";
import { HopeProvider, HopeThemeConfig } from "@hope-ui/solid";
import { Toaster } from "solid-toast";
import App from "./App";
import "./styles/global.css";

// Hope UI theme configuration
const config: HopeThemeConfig = {
  initialColorMode: "system",
  lightTheme: {
    colors: {
      primary9: "#0080e6",
    }
  },
  darkTheme: {
    colors: {
      primary9: "#0080e6",
    }
  },
  components: {
    Button: {
      baseStyle: {
        root: {
          borderRadius: "md",
          fontWeight: "medium",
        }
      }
    },
    Input: {
      baseStyle: {
        input: {
          borderRadius: "md",
        }
      }
    }
  }
};

render(() => (
  <HopeProvider config={config}>
    <Toaster position="top-right" />
    <App />
  </HopeProvider>
), document.getElementById("root") as HTMLElement);
