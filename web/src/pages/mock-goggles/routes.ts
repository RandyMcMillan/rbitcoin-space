// MOCKUP (GG5), never merged: throwaway pages for the owner to try the goggles on a phone.
import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

export const routes: RouteDefinition[] = [
  {
    path: "/mock/goggles",
    component: lazy(() => import("./MockGoggles").then((m) => ({ default: m.BlockPage }))),
  },
  {
    path: "/mock/goggles/home",
    component: lazy(() => import("./MockGoggles").then((m) => ({ default: m.HomePage }))),
  },
  {
    path: "/mock/goggles/inline",
    component: lazy(() => import("./MockGoggles").then((m) => ({ default: m.InlinePage }))),
  },
];
