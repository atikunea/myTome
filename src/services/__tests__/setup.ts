// The one place fake-indexeddb is installed. `db` is a module singleton created
// at import time, so isolation means wiping the database between tests rather
// than re-importing the module: delete it and open it again, which replays every
// version from v1 to the current one and so exercises the real schema.
import "fake-indexeddb/auto";
import { beforeEach, afterAll } from "vitest";
import { db } from "../../models/db";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
});
