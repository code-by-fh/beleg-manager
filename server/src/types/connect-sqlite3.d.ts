declare module "connect-sqlite3" {
  import type session from "express-session";
  function ConnectSqlite3(s: typeof session): new (options?: {
    db?: string;
    dir?: string;
    table?: string;
    concurrentDB?: boolean;
  }) => session.Store;
  export default ConnectSqlite3;
}
