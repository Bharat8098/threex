import { useCallback, useEffect, useState } from "react";

/** Where the sheet is: the list, one spot, or About & Data. Each has its own URL, so the
 * browser's back button works and a spot can be shared as a link. */
export type Route = { name: "list" } | { name: "spot"; id: string } | { name: "about" };

export function parseRoute(path: string): Route {
  const spot = /^\/spot\/([\w-]+)\/?$/.exec(path);
  if (spot) return { name: "spot", id: spot[1]! };
  if (/^\/about\/?$/.test(path)) return { name: "about" };
  return { name: "list" };
}

export function routePath(route: Route): string {
  return route.name === "spot" ? `/spot/${route.id}` : route.name === "about" ? "/about" : "/";
}

/** Marks history entries this app pushed, so "back" only goes back within the app. */
const PUSHED = "threex";

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: Route) => {
    history.pushState(PUSHED, "", routePath(next));
    setRoute(next);
  }, []);

  /** Back within the app, or to the list when the page was opened on a deep link. */
  const back = useCallback(() => {
    if (history.state === PUSHED) history.back();
    else {
      history.replaceState(null, "", "/");
      setRoute({ name: "list" });
    }
  }, []);

  return { route, go, back };
}
