import type { AuthContext } from "../auth/types";

export type Env = {
  Variables: {
    auth: AuthContext;
  };
};
