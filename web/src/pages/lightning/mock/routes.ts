// The Lightning mockups' routes: each page its own lazy chunk, reading sample data only.
import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

export const routes: RouteDefinition[] = [
  { path: "/mock/lightning", component: lazy(() => import("./OverviewPage")) },
  { path: "/mock/lightning/node/:key", component: lazy(() => import("./NodePage")) },
  { path: "/mock/lightning/channel/:id", component: lazy(() => import("./ChannelPage")) },
  { path: "/mock/lightning/block", component: lazy(() => import("./BlockPage")) },
  { path: "/mock/lightning/penalties", component: lazy(() => import("./PenaltiesPage")) },
];
