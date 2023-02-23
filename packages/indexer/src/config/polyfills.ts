/* eslint-disable @typescript-eslint/no-explicit-any */

// Reference: https://github.com/mswjs/msw/issues/686#issuecomment-816241875
import "node-fetch";

// Reference: https://github.com/apollographql/apollo-link-rest/issues/41#issuecomment-354923559
import * as f from "node-fetch";
(global as any).Headers = f.Headers;
