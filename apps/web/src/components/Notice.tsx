import { CloudSlash, Export, X } from "@phosphor-icons/react";
import { strings } from "../copy/strings.ts";
import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./Notice.module.css";

function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Shown while offline: the app keeps working from its cache. */
export function OfflineBanner() {
  if (useOnline()) return null;
  return (
    <div className={`glass ${styles.banner}`} role="status">
      <CloudSlash aria-hidden weight="bold" />
      <span className="t-subheadline">{strings.offline}</span>
    </div>
  );
}

const DISMISSED = "threex-install-hint-dismissed";

function isIosSafariTab(): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone;
  return ios && !standalone;
}

/** iOS has no install prompt: explain Share → Add to Home Screen, once per session. */
export function InstallHint({ force = false }: { force?: boolean }) {
  const [show, setShow] = useState(force);
  useEffect(() => {
    if (!force) setShow(isIosSafariTab() && !sessionStorage.getItem(DISMISSED));
  }, [force]);
  if (!show) return null;
  return (
    <div className={styles.hint} role="note">
      <Export aria-hidden className={styles.hintIcon} weight="bold" />
      <p className="t-subheadline">
        <strong>{strings.install.lead}</strong>
        {strings.install.body}
        <span className={styles.key}>{strings.install.share}</span>
        {strings.install.then}
        <span className={styles.key}>{strings.install.add}</span>.
      </p>
      <button
        type="button"
        className={styles.close}
        aria-label={strings.install.dismiss}
        onClick={() => {
          sessionStorage.setItem(DISMISSED, "1");
          setShow(false);
        }}
      >
        <X aria-hidden weight="bold" />
      </button>
    </div>
  );
}
