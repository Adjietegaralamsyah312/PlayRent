var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import { useNavigate, NavLink, useSearchParams, MemoryRouter } from "react-router-dom";
import { createContext, useState, useRef, useCallback, useEffect, useMemo, useContext, forwardRef, useId } from "react";
import { Info, AlertTriangle, XCircle, CheckCircle2, X, KeyRound, ArrowLeft, Minus, Clock, Radio, Ban, TriangleAlert, ShieldAlert, CalendarX, CircleCheck, LogIn, CalendarCheck, Hourglass, Wrench, CalendarClock, Gamepad2, CalendarPlus, Timer, ChevronRight, MapPin, ArrowUp, ArrowDown, ChevronsUpDown, Package, Ticket, Save } from "lucide-react";
import { createPortal } from "react-dom";
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    __publicField(this, "status");
    __publicField(this, "code");
    __publicField(this, "details");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
let onUnauthorized = null;
function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}
function buildQuery(query) {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === void 0 || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
async function request(path, opts = {}) {
  var _a, _b, _c;
  const { method = "GET", body, query, skipAuthRedirect } = opts;
  let res;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, {
      method,
      credentials: "include",
      headers: body !== void 0 ? { "Content-Type": "application/json" } : void 0,
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
  }
  let json = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const code = ((_a = json == null ? void 0 : json.error) == null ? void 0 : _a.code) ?? "INTERNAL_ERROR";
    const message = ((_b = json == null ? void 0 : json.error) == null ? void 0 : _b.message) ?? "Terjadi kesalahan pada server.";
    if (res.status === 401 && !skipAuthRedirect) onUnauthorized == null ? void 0 : onUnauthorized();
    throw new ApiError(res.status, code, message, (_c = json == null ? void 0 : json.error) == null ? void 0 : _c.details);
  }
  if (!json || json.data === void 0) {
    throw new ApiError(res.status, "INVALID_RESPONSE", "Respons server tidak dikenali.");
  }
  return json.data;
}
const auth = {
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password }, skipAuthRedirect: true }),
  /**
   * Public self-registration. The body carries NO `role` — the server decides
   * the role and rejects a body that tries to (400).
   */
  register: (body) => request("/auth/register", { method: "POST", body, skipAuthRedirect: true }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me", { skipAuthRedirect: true }),
  /** Own profile only — fullName and phone. */
  updateProfile: (body) => request("/auth/profile", { method: "PATCH", body }),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } })
};
const consoles = {
  list: (q) => request("/consoles", { query: q }),
  /**
   * Customer view — same endpoint, fewer fields. The server drops the internal
   * condition note for a non-admin session.
   */
  listPublic: () => request("/consoles"),
  get: (id) => request(`/consoles/${id}`),
  create: (body) => request("/consoles", { method: "POST", body }),
  update: (id, body) => request(`/consoles/${id}`, { method: "PATCH", body }),
  remove: (id) => request(`/consoles/${id}`, { method: "DELETE" })
};
const bookings = {
  list: (q) => request("/bookings", { query: q }),
  get: (id) => request(`/bookings/${id}`),
  create: (body) => request("/bookings", { method: "POST", body }),
  update: (id, body) => request(`/bookings/${id}`, { method: "PATCH", body }),
  checkIn: (id, durationMinutes) => request(`/bookings/${id}/check-in`, { method: "POST", body: durationMinutes ? { durationMinutes } : {} }),
  cancel: (id, reason) => request(`/bookings/${id}/cancel`, { method: "POST", body: { reason } })
};
const games = {
  list: (q) => request("/games", { query: q }),
  create: (body) => request("/games", { method: "POST", body }),
  update: (id, body) => request(`/games/${id}`, { method: "PATCH", body }),
  remove: (id) => request(`/games/${id}`, { method: "DELETE" })
};
const settings = {
  get: () => request("/settings"),
  /** Customer view: the server trims the payment methods and the overtime tariff. */
  getPublic: () => request("/settings"),
  update: (body) => request("/settings", { method: "PUT", body }),
  packages: () => request("/packages"),
  createPackage: (body) => request("/packages", { method: "POST", body }),
  updatePackage: (id, body) => request(`/packages/${id}`, { method: "PATCH", body }),
  removePackage: (id) => request(`/packages/${id}`, { method: "DELETE" })
};
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const { user: me } = await auth.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void refresh().finally(() => setLoading(false));
  }, [refresh]);
  const login = useCallback(async (username, password) => {
    const { user: me } = await auth.login(username, password);
    setUser(me);
    return me;
  }, []);
  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
    }
    setUser(null);
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);
  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, setUser }),
    [user, loading, login, logout, refresh]
  );
  return /* @__PURE__ */ jsx(AuthContext.Provider, { value, children });
}
function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
const ToastContext = createContext(null);
const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};
const TONE_CLASS$1 = {
  success: "border-success/40 bg-success-soft text-success",
  error: "border-danger/40 bg-danger-soft text-danger-text",
  warning: "border-warning/40 bg-warning-soft text-warning",
  info: "border-info/40 bg-info-soft text-info"
};
let seq = 0;
const nextId = () => `t${++seq}-${Date.now()}`;
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);
  const toast = useCallback((input) => {
    const id = nextId();
    const duration = input.duration ?? (input.action ? 8e3 : 4200);
    setToasts((list) => [...list, { ...input, id, duration }].slice(-3));
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);
  const api = useMemo(() => ({
    toast,
    dismiss,
    success: (message, action) => toast({ tone: "success", message, action }),
    error: (message, action) => toast({ tone: "error", message, action, duration: action ? 0 : 6e3 }),
    warning: (message) => toast({ tone: "warning", message, duration: 6e3 }),
    info: (message) => toast({ tone: "info", message })
  }), [toast, dismiss]);
  return /* @__PURE__ */ jsxs(ToastContext.Provider, { value: api, children: [
    children,
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pb-[var(--spacing-safe-bottom)]",
        role: "region",
        "aria-label": "Notifikasi",
        children: toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return /* @__PURE__ */ jsxs(
            "div",
            {
              role: t.tone === "error" ? "alert" : "status",
              "aria-live": t.tone === "error" ? "assertive" : "polite",
              className: `pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-e3)] ${TONE_CLASS$1[t.tone]}`,
              style: { animation: "pr-slide-up var(--duration-base) var(--ease-out)" },
              children: [
                /* @__PURE__ */ jsx(Icon, { className: "mt-0.5 size-5 shrink-0", "aria-hidden": "true" }),
                /* @__PURE__ */ jsx("p", { className: "flex-1 text-body-sm leading-snug text-text", children: t.message }),
                t.action && /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      var _a;
                      (_a = t.action) == null ? void 0 : _a.onClick();
                      dismiss(t.id);
                    },
                    className: "shrink-0 rounded-[var(--radius-sm)] px-2 py-0.5 text-label font-[var(--font-weight-medium)] text-text underline-offset-2 hover:underline",
                    children: t.action.label
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => dismiss(t.id),
                    className: "shrink-0 rounded-[var(--radius-sm)] p-0.5 text-text-muted hover:text-text",
                    "aria-label": "Tutup notifikasi",
                    children: /* @__PURE__ */ jsx(X, { className: "size-4", "aria-hidden": "true" })
                  }
                )
              ]
            },
            t.id
          );
        })
      }
    )
  ] });
}
function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
const HIT_AREA = "relative before:absolute before:content-[''] before:inset-x-0 before:-inset-y-1.5";
const SIZE_CLASS = {
  sm: `h-8 px-3 text-body-sm gap-1.5 ${HIT_AREA}`,
  md: "h-10 px-4 text-body-sm gap-2",
  lg: "h-12 px-5 text-body-lg gap-2"
};
const VARIANT_CLASS = {
  // White on accent = 5.70:1 (DESIGN.md §3.3). `text-text-inverse` is 3.40:1
  // here — it only belongs on the cyan fill.
  primary: "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
  secondary: "bg-surface-2 text-text border border-border-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text",
  danger: "bg-danger-strong text-white hover:brightness-110 active:brightness-95",
  link: "bg-transparent text-accent-text underline-offset-2 hover:underline px-1"
};
const Button = forwardRef(function Button2({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  iconLeft,
  iconRight,
  fullWidth,
  type = "button",
  disabled,
  className = "",
  children,
  ...rest
}, ref) {
  const isDisabled = disabled || loading;
  return /* @__PURE__ */ jsxs(
    "button",
    {
      ref,
      type,
      disabled: isDisabled,
      "aria-busy": loading || void 0,
      className: [
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap",
        "transition-colors duration-fast ease-standard select-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidth ? "w-full" : "",
        className
      ].filter(Boolean).join(" "),
      ...rest,
      children: [
        loading ? /* @__PURE__ */ jsx(Spinner, { size: size === "lg" ? "md" : "sm" }) : iconLeft,
        /* @__PURE__ */ jsx("span", { children: loading && loadingText ? loadingText : children }),
        !loading && iconRight
      ]
    }
  );
});
const ICON_SIZE_CLASS = {
  sm: "size-11",
  md: "size-11",
  lg: "size-12"
};
const ICON_TONE_CLASS = {
  neutral: "hover:text-text",
  success: "hover:text-success",
  warning: "hover:text-warning",
  danger: "hover:text-danger-text",
  info: "hover:text-info",
  accent: "hover:text-accent-text",
  cyan: "hover:text-cyan",
  muted: "hover:text-text"
};
const IconButton = forwardRef(function IconButton2({ icon, label, variant = "ghost", size = "md", loading = false, tone = "neutral", disabled, className = "", ...rest }, ref) {
  const isDisabled = disabled || loading;
  return /* @__PURE__ */ jsxs(
    "button",
    {
      ref,
      type: "button",
      disabled: isDisabled,
      "aria-busy": loading || void 0,
      "aria-label": label,
      title: label,
      className: [
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-fast",
        ICON_SIZE_CLASS[size],
        variant === "solid" ? "bg-surface-2 text-text border border-border-strong hover:bg-surface-hover" : `bg-transparent text-text-secondary hover:bg-surface-hover ${ICON_TONE_CLASS[tone]}`,
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      ].filter(Boolean).join(" "),
      ...rest,
      children: [
        loading ? /* @__PURE__ */ jsx(Spinner, { size: "sm" }) : icon,
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: label })
      ]
    }
  );
});
function Spinner({ size = "md", label = "Memuat…" }) {
  const box = size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5";
  const stroke = size === "lg" ? 3 : 2;
  return /* @__PURE__ */ jsxs("span", { role: "status", className: "inline-flex items-center justify-center", children: [
    /* @__PURE__ */ jsxs("svg", { className: `${box} animate-spin`, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [
      /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeOpacity: "0.25", strokeWidth: stroke }),
      /* @__PURE__ */ jsx("path", { d: "M22 12a10 10 0 0 0-10-10", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round" })
    ] }),
    /* @__PURE__ */ jsx("span", { className: "sr-only", children: label })
  ] });
}
const FIELD_SIZE = {
  sm: "h-9 text-body-sm",
  md: "h-11 text-body lg:h-10",
  lg: "h-12 text-body-lg"
};
const CONTROL_BASE = "w-full rounded-md bg-surface-2 text-text placeholder:text-text-muted border transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface";
function RequiredMark() {
  return /* @__PURE__ */ jsx("span", { className: "ml-0.5 text-danger", "aria-hidden": "true", children: "*" });
}
function FieldShell({ id, label, requiredMark, helpText, error, helpId, errorId, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5", children: [
    /* @__PURE__ */ jsxs("label", { htmlFor: id, className: "text-label font-medium text-text-secondary", children: [
      label,
      requiredMark && /* @__PURE__ */ jsx(RequiredMark, {})
    ] }),
    children,
    helpText && !error && /* @__PURE__ */ jsx("p", { id: helpId, className: "text-caption text-text-muted", children: helpText }),
    error && /* @__PURE__ */ jsx("p", { id: errorId, role: "alert", className: "text-caption text-danger", children: error })
  ] });
}
const Input = forwardRef(function Input2({ label, size = "md", helpText, error, prefix, suffix, requiredMark, id, className = "", ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const describedBy = [error ? errorId : null, helpText ? helpId : null].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsx(FieldShell, { id: fieldId, label, requiredMark, helpText, error, helpId, errorId, children: /* @__PURE__ */ jsxs("div", { className: "relative flex items-center", children: [
    prefix && /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute left-3 text-body-sm text-text-muted", children: prefix }),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref,
        id: fieldId,
        "aria-invalid": error ? true : void 0,
        "aria-describedby": describedBy || void 0,
        "aria-required": requiredMark || void 0,
        className: [
          CONTROL_BASE,
          FIELD_SIZE[size],
          prefix ? "pl-11" : "pl-3",
          suffix ? "pr-14" : "pr-3",
          error ? "border-danger" : "border-border-strong hover:border-border-strong",
          className
        ].filter(Boolean).join(" "),
        ...rest
      }
    ),
    suffix && /* @__PURE__ */ jsx("span", { className: "absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-body-sm text-text-muted", children: suffix })
  ] }) });
});
const Textarea = forwardRef(function Textarea2({ label, rows = 3, maxLength, helpText, error, requiredMark, id, className = "", value, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const describedBy = [error ? errorId : null, helpText ? helpId : null].filter(Boolean).join(" ");
  const len = typeof value === "string" ? value.length : 0;
  return /* @__PURE__ */ jsxs(FieldShell, { id: fieldId, label, requiredMark, helpText, error, helpId, errorId, children: [
    /* @__PURE__ */ jsx(
      "textarea",
      {
        ref,
        id: fieldId,
        rows,
        maxLength,
        value,
        "aria-invalid": error ? true : void 0,
        "aria-describedby": describedBy || void 0,
        "aria-required": requiredMark || void 0,
        className: [
          CONTROL_BASE,
          "min-h-20 resize-y px-3 py-2 leading-normal",
          error ? "border-danger" : "border-border-strong",
          className
        ].filter(Boolean).join(" "),
        ...rest
      }
    ),
    maxLength && /* @__PURE__ */ jsxs("p", { className: "text-right text-caption text-text-muted tnum", children: [
      len,
      "/",
      maxLength
    ] })
  ] });
});
function Select({
  label,
  options,
  size = "md",
  placeholder,
  helpText,
  error,
  requiredMark,
  id,
  className = "",
  ...rest
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const describedBy = [error ? errorId : null, helpText ? helpId : null].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsx(FieldShell, { id: fieldId, label, requiredMark, helpText, error, helpId, errorId, children: /* @__PURE__ */ jsxs(
    "select",
    {
      id: fieldId,
      "aria-invalid": error ? true : void 0,
      "aria-describedby": describedBy || void 0,
      "aria-required": requiredMark || void 0,
      className: [
        CONTROL_BASE,
        FIELD_SIZE[size],
        "px-3 pr-9 appearance-none",
        `bg-[url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238590A8' stroke-width='2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>")] bg-[length:18px] bg-[right_0.6rem_center] bg-no-repeat`,
        error ? "border-danger" : "border-border-strong",
        className
      ].filter(Boolean).join(" "),
      ...rest,
      children: [
        placeholder && /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: placeholder }),
        options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, disabled: o.disabled, children: o.label }, o.value))
      ]
    }
  ) });
}
forwardRef(function Checkbox2({ label, description, size = "md", id, className = "", ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const box = size === "sm" ? "size-5" : "size-6";
  return /* @__PURE__ */ jsxs("div", { className: ["flex items-start gap-3", className].filter(Boolean).join(" "), children: [
    /* @__PURE__ */ jsx(
      "input",
      {
        ref,
        id: fieldId,
        type: "checkbox",
        className: `${box} mt-0.5 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50`,
        ...rest
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
      /* @__PURE__ */ jsx("label", { htmlFor: fieldId, className: "cursor-pointer text-body-sm text-text", children: label }),
      description && /* @__PURE__ */ jsx("span", { className: "text-caption text-text-muted", children: description })
    ] })
  ] });
});
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
function Overlay({
  open,
  onOpenChange,
  labelledBy,
  describedBy,
  dismissible,
  initialFocusRef,
  shellClassName,
  children
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    const target = (initialFocusRef == null ? void 0 : initialFocusRef.current) ?? (panel == null ? void 0 : panel.querySelector(FOCUSABLE)) ?? panel;
    target == null ? void 0 : target.focus();
    function onKeyDown(e) {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      var _a, _b;
      document.removeEventListener("keydown", onKeyDown, true);
      (_b = (_a = restoreRef.current) == null ? void 0 : _a.focus) == null ? void 0 : _b.call(_a);
    };
  }, [open, dismissible, onOpenChange, initialFocusRef]);
  if (!open) return null;
  return createPortal(
    /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-[var(--z-modal)] flex items-end justify-center sm:items-center sm:p-4 print:hidden", children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "absolute inset-0 bg-overlay",
          style: { animation: "pr-fade var(--duration-base) var(--ease-out)" },
          onClick: () => dismissible && onOpenChange(false),
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          ref: panelRef,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": labelledBy,
          "aria-describedby": describedBy,
          tabIndex: -1,
          className: [
            "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface-2 shadow-e3 outline-none",
            "rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)]",
            shellClassName
          ].join(" "),
          style: { animation: "pr-slide-up var(--duration-slow) var(--ease-out)" },
          children
        }
      )
    ] }),
    document.body
  );
}
function DragHandle() {
  return /* @__PURE__ */ jsx("div", { className: "mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden", "aria-hidden": "true" });
}
const MODAL_WIDTH = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl"
};
function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  dismissible = true,
  initialFocusRef
}) {
  const titleId = useId();
  const descId = useId();
  return /* @__PURE__ */ jsxs(
    Overlay,
    {
      open,
      onOpenChange,
      labelledBy: titleId,
      describedBy: description ? descId : void 0,
      dismissible,
      initialFocusRef,
      shellClassName: MODAL_WIDTH[size],
      children: [
        /* @__PURE__ */ jsx(DragHandle, {}),
        /* @__PURE__ */ jsxs("header", { className: "flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:pt-5", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx("h2", { id: titleId, className: "text-h2 font-semibold text-text", children: title }),
            description && /* @__PURE__ */ jsx("p", { id: descId, className: "mt-1 text-body-sm text-text-secondary", children: description })
          ] }),
          dismissible && /* @__PURE__ */ jsx(
            IconButton,
            {
              icon: /* @__PURE__ */ jsx(X, { className: "size-5", "aria-hidden": "true" }),
              label: "Tutup",
              onClick: () => onOpenChange(false),
              className: "-mr-1 -mt-1"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 pb-4", children }),
        footer && /* @__PURE__ */ jsx(
          "footer",
          {
            className: "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end",
            style: { paddingBottom: "calc(1rem + var(--spacing-safe-bottom))" },
            children: footer
          }
        )
      ]
    }
  );
}
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  tone = "default",
  onConfirm,
  submitting = false,
  error,
  requireText,
  reason
}) {
  const [typed, setTyped] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = useCallback(() => {
    setTyped("");
    setReasonText("");
  }, []);
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);
  const reasonMissing = Boolean(reason) && (reason == null ? void 0 : reason.optional) !== true && reasonText.trim().length < 3;
  const textMatches = !requireText || typed.trim() === requireText;
  const disabled = busy || submitting || !textMatches || reasonMissing;
  async function handleConfirm() {
    if (disabled) return;
    setBusy(true);
    try {
      await onConfirm(reasonText.trim());
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsx(
    Modal,
    {
      open,
      onOpenChange,
      title,
      description,
      size: "sm",
      dismissible: !busy && !submitting,
      footer: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => onOpenChange(false), disabled: busy || submitting, children: cancelLabel }),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: tone === "destructive" ? "danger" : "primary",
            onClick: handleConfirm,
            loading: busy || submitting,
            loadingText: "Memproses…",
            disabled,
            children: confirmLabel
          }
        )
      ] }),
      children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
        reason && /* @__PURE__ */ jsx(
          Textarea,
          {
            label: reason.label,
            placeholder: reason.placeholder,
            requiredMark: !reason.optional,
            rows: 3,
            maxLength: 200,
            value: reasonText,
            onChange: (e) => setReasonText(e.target.value),
            error: !reason.optional && reasonText.length > 0 && reasonMissing ? "Alasan minimal 3 karakter." : void 0
          }
        ),
        requireText && /* @__PURE__ */ jsx(
          Input,
          {
            label: `Ketik "${requireText}" untuk konfirmasi`,
            value: typed,
            onChange: (e) => setTyped(e.target.value),
            autoComplete: "off",
            requiredMark: true
          }
        ),
        error && /* @__PURE__ */ jsx("p", { role: "alert", className: "text-body-sm text-danger", children: error })
      ] })
    }
  );
}
const UNITS = {
  items: [
    { id: "1", code: "PS5-01", consoleType: "PS5", roomType: "VIP", controllers: 4, hourlyRate: 25e3, status: "available", isActive: true },
    { id: "2", code: "PS4-01", consoleType: "PS4", roomType: "Reguler", controllers: 2, hourlyRate: 8e3, status: "in_use", isActive: true }
  ]
};
const BOOKINGS = {
  items: [
    { id: "9", consoleId: "1", customerName: "Budi Santoso", customerContact: "0812", bookingDate: "2099-10-25", startTime: "19:00", durationMinutes: 100, status: "pending", notes: null, discount: 0, isExpired: false },
    { id: "10", consoleId: "2", customerName: "Budi Santoso", customerContact: null, bookingDate: "2099-10-26", startTime: "10:00", durationMinutes: 60, status: "confirmed", notes: null, discount: 0, isExpired: true },
    { id: "11", consoleId: "1", customerName: "Budi Santoso", customerContact: null, bookingDate: "2099-10-20", startTime: "09:00", durationMinutes: 45, status: "cancelled", notes: null, discount: 0, isExpired: false }
  ]
};
const SETTINGS_PUBLIC = {
  business: { name: "PlayRent Gaming Lounge", address: "Jl. Merdeka No. 45, Bandung", phone: "0812", receiptFooter: "", taxNote: "" },
  rules: { minDurationMinutes: 30, roundingMinutes: 15, defaultHourlyRate: 15e3, warnMinutes: [10, 5, 1] }
};
const PACKAGES = {
  items: [
    { id: "1", name: "Paket 1 Jam", durationMinutes: 60, price: 8e3, consoleType: null, isActive: true, createdAt: "2026-01-01" },
    { id: "2", name: "Paket Nonaktif", durationMinutes: 90, price: 9e3, consoleType: "PS5", isActive: false, createdAt: "2026-01-01" }
  ]
};
const GAMES = {
  items: [
    { id: "1", title: "EA SPORTS FC 25", platform: "PS5", genre: "Sports", recommendedControllers: 2, availabilityNote: "Rak A1", isActive: true },
    { id: "2", title: "GTA V", platform: "both", genre: "Action", recommendedControllers: null, availabilityNote: null, isActive: true }
  ]
};
let mode = "data";
function setMode(m) {
  mode = m;
}
function pick(value, empty) {
  if (mode === "error") return value;
  if (mode === "empty") return empty;
  return value;
}
function useAsync(fn, _deps = []) {
  const src = fn.toString();
  let data = null;
  if (src.includes("consoles.listPublic")) data = pick(UNITS, { items: [] });
  else if (src.includes("bookings.list")) data = pick(BOOKINGS, { items: [] });
  else if (src.includes("settings.getPublic")) data = pick(SETTINGS_PUBLIC, null);
  else if (src.includes("settings.packages")) data = pick(PACKAGES, { items: [] });
  else if (src.includes("games.list")) data = pick(GAMES, { items: [] });
  return {
    data: mode === "loading" ? null : data,
    loading: mode === "loading",
    error: mode === "error" ? "Gagal memuat data dari server." : null,
    reload: async () => {
    },
    setData: () => {
    }
  };
}
function errorMessage() {
  return "Gagal memuat data dari server.";
}
function ChangePasswordDialog({ open, onOpenChange }) {
  const { success } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    }
  }, [open]);
  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 8;
  async function submit() {
    if (tooShort) {
      setError("Sandi baru minimal 8 karakter.");
      return;
    }
    if (mismatch) {
      setError("Konfirmasi sandi tidak sama.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(current, next);
      success("Sandi berhasil diubah.");
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage());
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsx(
    Modal,
    {
      open,
      onOpenChange,
      title: "Ubah sandi",
      size: "sm",
      footer: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => onOpenChange(false), disabled: busy, children: "Batal" }),
        /* @__PURE__ */ jsx(
          Button,
          {
            onClick: submit,
            loading: busy,
            loadingText: "Menyimpan…",
            iconLeft: /* @__PURE__ */ jsx(KeyRound, { className: "size-4", "aria-hidden": "true" }),
            disabled: !current || !next || mismatch || tooShort,
            children: "Simpan sandi"
          }
        )
      ] }),
      children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ jsx(
          Input,
          {
            label: "Sandi saat ini",
            type: "password",
            autoComplete: "current-password",
            value: current,
            onChange: (e) => setCurrent(e.target.value),
            requiredMark: true
          }
        ),
        /* @__PURE__ */ jsx(
          Input,
          {
            label: "Sandi baru",
            type: "password",
            autoComplete: "new-password",
            value: next,
            onChange: (e) => setNext(e.target.value),
            helpText: "Minimal 8 karakter.",
            error: tooShort ? "Minimal 8 karakter." : void 0,
            requiredMark: true
          }
        ),
        /* @__PURE__ */ jsx(
          Input,
          {
            label: "Ulangi sandi baru",
            type: "password",
            autoComplete: "new-password",
            value: confirm,
            onChange: (e) => setConfirm(e.target.value),
            error: mismatch ? "Konfirmasi sandi tidak sama." : void 0,
            requiredMark: true
          }
        ),
        error && /* @__PURE__ */ jsx("p", { role: "alert", className: "text-body-sm text-danger", children: error })
      ] })
    }
  );
}
const TZ = "Asia/Jakarta";
const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
function formatIDR(value) {
  if (value === null || value === void 0 || Number.isNaN(value)) return "Rp 0";
  return `Rp ${idr.format(Math.round(value))}`;
}
function formatJakarta(iso, style = "short") {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = { timeZone: TZ };
  if (style === "time") Object.assign(opts, { hour: "2-digit", minute: "2-digit", hour12: false });
  else if (style === "date") Object.assign(opts, { day: "2-digit", month: "short", year: "numeric" });
  else if (style === "short") Object.assign(opts, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  else Object.assign(opts, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return new Intl.DateTimeFormat("id-ID", opts).format(d);
}
function formatDurationShort(minutes) {
  const m = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}j`;
  return `${h}j ${rest}m`;
}
function toJakartaDateStr(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return parts;
}
function toJakartaDateTimeStr(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => {
    var _a;
    return ((_a = parts.find((p) => p.type === type)) == null ? void 0 : _a.value) ?? "";
  };
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
function greeting(date = /* @__PURE__ */ new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(date));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}
const ROLE_LABEL = { superadmin: "Super Admin", user: "Pelanggan" };
function PageHeader({ title, subtitle, breadcrumb, actions, backTo }) {
  const navigate = useNavigate();
  return /* @__PURE__ */ jsxs("header", { className: "mb-5 flex flex-col gap-3", children: [
    breadcrumb && breadcrumb.length > 0 && /* @__PURE__ */ jsx("nav", { "aria-label": "Breadcrumb", className: "text-caption text-text-muted", children: /* @__PURE__ */ jsx("ol", { className: "flex flex-wrap items-center gap-1.5", children: breadcrumb.map((b, i) => /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-1.5", children: [
      i > 0 && /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "/" }),
      b.href ? /* @__PURE__ */ jsx(NavLink, { to: b.href, className: "hover:text-text", children: b.label }) : /* @__PURE__ */ jsx("span", { children: b.label })
    ] }, `${b.label}-${i}`)) }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 items-start gap-3", children: [
        backTo && /* @__PURE__ */ jsx("span", { className: "lg:hidden", children: /* @__PURE__ */ jsx(IconButton, { icon: /* @__PURE__ */ jsx(ArrowLeft, { className: "size-5", "aria-hidden": "true" }), label: "Kembali", onClick: () => navigate(backTo) }) }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("h1", { className: "truncate text-h1 font-bold tracking-heading text-text", children: title }),
          subtitle && /* @__PURE__ */ jsx("p", { className: "mt-1 text-body-sm text-text-secondary", children: subtitle })
        ] })
      ] }),
      actions && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 flex-wrap items-center gap-2 sm:justify-end", children: actions })
    ] })
  ] });
}
function PageSection({ title, description, actions, children }) {
  return /* @__PURE__ */ jsxs("section", { className: "mb-6 flex flex-col gap-3", children: [
    (title || actions) && /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        title && /* @__PURE__ */ jsx("h2", { className: "text-h3 font-semibold text-text", children: title }),
        description && /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-body-sm text-text-secondary", children: description })
      ] }),
      actions && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 flex-wrap items-center gap-2 sm:justify-end", children: actions })
    ] }),
    children
  ] });
}
function StickyActionBar({ children, visible = true }) {
  if (!visible) return null;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "fixed inset-x-0 bottom-[calc(3.75rem+var(--spacing-safe-bottom))] z-[var(--z-sticky)] border-t border-border bg-sidebar px-4 py-3 lg:hidden", children: /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2", children }) }),
    /* @__PURE__ */ jsx("div", { className: "sticky bottom-0 z-[var(--z-sticky)] hidden border-t border-border bg-sidebar px-6 py-2.5 lg:flex lg:items-center lg:justify-end lg:gap-2", children })
  ] });
}
const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6"
};
function Card({
  children,
  title,
  description,
  actions,
  interactive,
  selected,
  padding = "md",
  as
}) {
  const Tag = as ?? "div";
  const hasHeader = Boolean(title || description || actions);
  return /* @__PURE__ */ jsxs(
    Tag,
    {
      className: [
        "rounded-[var(--radius-lg)] border bg-surface",
        selected ? "border-border-strong ring-1 ring-[var(--color-border-strong)]" : "border-border",
        interactive ? "transition-colors duration-fast hover:bg-surface-hover" : "",
        PADDING[padding]
      ].filter(Boolean).join(" "),
      children: [
        hasHeader && /* @__PURE__ */ jsxs("div", { className: `flex items-start justify-between gap-3 ${padding === "none" ? "px-4 pt-4" : ""} ${children ? "mb-3" : ""}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
            title && /* @__PURE__ */ jsx("h2", { className: "truncate text-h3 font-semibold text-text", children: title }),
            description && /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-body-sm text-text-secondary", children: description })
          ] }),
          actions && /* @__PURE__ */ jsx("div", { className: "flex shrink-0 items-center gap-2", children: actions })
        ] }),
        children
      ]
    }
  );
}
const TONE_CLASS = {
  neutral: "bg-neutral-soft text-text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger-text",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-text",
  cyan: "bg-cyan-soft text-cyan",
  muted: "bg-neutral-soft text-text-muted"
};
const TONE_OUTLINE = {
  neutral: "border-border-strong text-text-secondary",
  success: "border-success/50 text-success",
  warning: "border-warning/50 text-warning",
  danger: "border-danger/50 text-danger-text",
  info: "border-info/50 text-info",
  accent: "border-accent/50 text-accent-text",
  cyan: "border-cyan/50 text-cyan",
  muted: "border-border-strong text-text-muted"
};
function Badge({ tone = "neutral", children, size = "sm", withIcon, variant = "soft" }) {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      className: [
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-label" : "px-2.5 py-1 text-body-sm",
        variant === "soft" ? TONE_CLASS[tone] : `border ${TONE_OUTLINE[tone]}`
      ].join(" "),
      children: [
        withIcon,
        children
      ]
    }
  );
}
const TONE_ICON = {
  neutral: /* @__PURE__ */ jsx(Minus, { className: "size-3.5", "aria-hidden": "true" }),
  success: /* @__PURE__ */ jsx(CheckCircle2, { className: "size-3.5", "aria-hidden": "true" }),
  warning: /* @__PURE__ */ jsx(AlertTriangle, { className: "size-3.5", "aria-hidden": "true" }),
  danger: /* @__PURE__ */ jsx(Ban, { className: "size-3.5", "aria-hidden": "true" }),
  info: /* @__PURE__ */ jsx(Info, { className: "size-3.5", "aria-hidden": "true" }),
  accent: /* @__PURE__ */ jsx(Radio, { className: "size-3.5", "aria-hidden": "true" }),
  cyan: /* @__PURE__ */ jsx(Clock, { className: "size-3.5", "aria-hidden": "true" }),
  muted: /* @__PURE__ */ jsx(Minus, { className: "size-3.5", "aria-hidden": "true" })
};
function StatusBadge({ value, map, size = "sm" }) {
  const meta = map[value];
  const label = (meta == null ? void 0 : meta.label) ?? String(value);
  const tone = (meta == null ? void 0 : meta.tone) ?? "warning";
  return /* @__PURE__ */ jsx(Badge, { tone, size, withIcon: (meta == null ? void 0 : meta.icon) ?? TONE_ICON[tone], children: label });
}
function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = "default",
  headingLevel = 2
}) {
  const isError = variant === "error";
  const isNoPerm = variant === "no-permission";
  const tone = isError ? "text-danger" : "text-text-muted";
  const fallbackIcon = isError ? /* @__PURE__ */ jsx(TriangleAlert, { className: "size-8", "aria-hidden": "true" }) : isNoPerm ? /* @__PURE__ */ jsx(ShieldAlert, { className: "size-8", "aria-hidden": "true" }) : null;
  const Title = `h${headingLevel}`;
  return /* @__PURE__ */ jsxs("div", { role: isError ? "alert" : void 0, className: "flex flex-col items-center px-4 py-10 text-center", children: [
    /* @__PURE__ */ jsx("span", { className: `mb-3 ${tone}`, children: icon ?? fallbackIcon }),
    /* @__PURE__ */ jsx(Title, { className: "text-h3 font-semibold text-text", children: title }),
    description && /* @__PURE__ */ jsx("p", { className: "mt-1.5 max-w-sm text-body-sm text-text-secondary", children: description }),
    (primaryAction || secondaryAction) && /* @__PURE__ */ jsxs("div", { className: "mt-5 flex flex-wrap items-center justify-center gap-2", children: [
      primaryAction,
      secondaryAction
    ] })
  ] });
}
const SHIMMER = "animate-pulse bg-surface-hover";
function Skeleton({ variant = "text", lines = 1, className = "", style }) {
  if (variant === "card") {
    return /* @__PURE__ */ jsx("div", { className: `${SHIMMER} h-32 w-full rounded-[var(--radius-lg)] ${className}`, style });
  }
  if (variant === "block") {
    return /* @__PURE__ */ jsx("div", { className: `${SHIMMER} h-16 w-full rounded-md ${className}`, style });
  }
  if (variant === "table-row") {
    return /* @__PURE__ */ jsxs("div", { className: `flex items-center gap-3 py-3 ${className}`, style, children: [
      /* @__PURE__ */ jsx("div", { className: `${SHIMMER} h-4 w-1/4 rounded-[var(--radius-sm)]` }),
      /* @__PURE__ */ jsx("div", { className: `${SHIMMER} h-4 w-1/3 rounded-[var(--radius-sm)]` }),
      /* @__PURE__ */ jsx("div", { className: `${SHIMMER} ml-auto h-4 w-16 rounded-[var(--radius-sm)]` })
    ] });
  }
  return /* @__PURE__ */ jsx("div", { className: `flex flex-col gap-2 ${className}`, style, "aria-hidden": "true", children: Array.from({ length: Math.max(1, lines) }).map((_, i) => /* @__PURE__ */ jsx("div", { className: `${SHIMMER} h-3.5 rounded-[var(--radius-sm)] ${i === lines - 1 && lines > 1 ? "w-3/5" : "w-full"}` }, i)) });
}
const ICON = "size-3.5";
const CONSOLE_STATUS = {
  available: { label: "Tersedia", tone: "success", icon: /* @__PURE__ */ jsx(CircleCheck, { className: ICON, "aria-hidden": "true" }) },
  in_use: { label: "Sedang Bermain", tone: "cyan", icon: /* @__PURE__ */ jsx(Gamepad2, { className: ICON, "aria-hidden": "true" }) },
  reserved: { label: "Dipesan", tone: "accent", icon: /* @__PURE__ */ jsx(CalendarClock, { className: ICON, "aria-hidden": "true" }) },
  maintenance: { label: "Perawatan", tone: "warning", icon: /* @__PURE__ */ jsx(Wrench, { className: ICON, "aria-hidden": "true" }) }
};
const BOOKING_STATUS = {
  pending: { label: "Menunggu", tone: "warning", icon: /* @__PURE__ */ jsx(Hourglass, { className: ICON, "aria-hidden": "true" }) },
  confirmed: { label: "Dikonfirmasi", tone: "cyan", icon: /* @__PURE__ */ jsx(CalendarCheck, { className: ICON, "aria-hidden": "true" }) },
  checked_in: { label: "Check-in", tone: "success", icon: /* @__PURE__ */ jsx(LogIn, { className: ICON, "aria-hidden": "true" }) },
  completed: { label: "Selesai", tone: "neutral", icon: /* @__PURE__ */ jsx(CircleCheck, { className: ICON, "aria-hidden": "true" }) },
  cancelled: { label: "Dibatalkan", tone: "muted", icon: /* @__PURE__ */ jsx(XCircle, { className: ICON, "aria-hidden": "true" }) }
};
const EFFECTIVE_BOOKING_STATUS = {
  ...BOOKING_STATUS,
  expired: { label: "Kedaluwarsa", tone: "danger", icon: /* @__PURE__ */ jsx(CalendarX, { className: ICON, "aria-hidden": "true" }) }
};
function effectiveBookingStatus(booking) {
  if (booking.isExpired === true && booking.status === "confirmed") return "expired";
  return booking.status;
}
const PLATFORM_LABEL = {
  PS4: "PS4",
  PS5: "PS5",
  both: "PS4 & PS5"
};
const UPCOMING = ["pending", "confirmed"];
function Beranda() {
  var _a, _b, _c;
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useAsync(() => bookings.list(), []);
  const units = useAsync(() => consoles.listPublic(), []);
  const cfg = useAsync(() => settings.getPublic(), []);
  const now = toJakartaDateTimeStr();
  const codeOf = (consoleId) => {
    var _a2, _b2;
    return ((_b2 = (_a2 = units.data) == null ? void 0 : _a2.items.find((u) => u.id === consoleId)) == null ? void 0 : _b2.code) ?? "—";
  };
  const next = (((_a = list.data) == null ? void 0 : _a.items) ?? []).filter((b) => UPCOMING.includes(b.status) && effectiveBookingStatus(b) !== "expired" && `${b.bookingDate} ${b.startTime}` >= now).sort((a, b) => `${a.bookingDate} ${a.startTime}`.localeCompare(`${b.bookingDate} ${b.startTime}`))[0];
  const firstName = ((user == null ? void 0 : user.fullName) ?? "").split(" ")[0] || (user == null ? void 0 : user.fullName) || "";
  const rules = (_b = cfg.data) == null ? void 0 : _b.rules;
  const business = (_c = cfg.data) == null ? void 0 : _c.business;
  if (list.loading || cfg.loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-5", children: [
      /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: "h-8 w-2/3" }),
      /* @__PURE__ */ jsx(Skeleton, { variant: "card" }),
      /* @__PURE__ */ jsx(Skeleton, { variant: "block" })
    ] });
  }
  if (list.error || units.error || cfg.error) {
    return /* @__PURE__ */ jsx(
      EmptyState,
      {
        variant: "error",
        headingLevel: 1,
        title: "Gagal memuat beranda",
        description: list.error ?? units.error ?? cfg.error ?? "Data tidak dapat dimuat.",
        primaryAction: /* @__PURE__ */ jsx(Button, { onClick: () => {
          void list.reload();
          void units.reload();
          void cfg.reload();
        }, children: "Coba lagi" })
      }
    );
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: `${greeting()}, ${firstName}`,
        subtitle: "Kelola booking rental Anda di sini.",
        actions: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "lg", onClick: () => navigate("/booking-saya"), children: "Lihat booking saya" }),
          /* @__PURE__ */ jsx(Button, { size: "lg", iconLeft: /* @__PURE__ */ jsx(CalendarPlus, { className: "size-5", "aria-hidden": "true" }), onClick: () => navigate("/booking-saya?buat=1"), children: "Buat booking" })
        ] })
      }
    ),
    /* @__PURE__ */ jsx(PageSection, { title: "Booking berikutnya", description: "Slot yang masih menunggu Anda.", children: next ? /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-h3 font-semibold text-text", children: [
            formatJakarta(`${next.bookingDate}T00:00:00+07:00`, "date"),
            " · ",
            next.startTime
          ] }),
          /* @__PURE__ */ jsx(StatusBadge, { value: effectiveBookingStatus(next), map: EFFECTIVE_BOOKING_STATUS })
        ] }),
        /* @__PURE__ */ jsxs("p", { className: "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Gamepad2, { className: "size-4 text-text-muted", "aria-hidden": "true" }),
            "Unit ",
            codeOf(next.consoleId)
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Timer, { className: "size-4 text-text-muted", "aria-hidden": "true" }),
            formatDurationShort(next.durationMinutes)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", iconRight: /* @__PURE__ */ jsx(ChevronRight, { className: "size-4", "aria-hidden": "true" }), onClick: () => navigate("/booking-saya"), children: "Detail booking" })
    ] }) }) : /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(
      EmptyState,
      {
        icon: /* @__PURE__ */ jsx(CalendarClock, { className: "size-8", "aria-hidden": "true" }),
        title: "Belum ada booking",
        description: "Pesan unit Anda sekarang dan Admin akan mengonfirmasi.",
        primaryAction: /* @__PURE__ */ jsx(Button, { size: "lg", onClick: () => navigate("/booking-saya?buat=1"), children: "Buat booking" })
      }
    ) }) }),
    /* @__PURE__ */ jsx(PageSection, { title: "Tarif rental", description: business == null ? void 0 : business.name, children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs("dl", { className: "flex flex-col gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-body-sm text-text-secondary", children: "Tarif dasar (mulai dari)" }),
        /* @__PURE__ */ jsxs("dd", { className: "text-h3 font-bold tnum text-text", children: [
          formatIDR(rules == null ? void 0 : rules.defaultHourlyRate),
          /* @__PURE__ */ jsx("span", { className: "text-body-sm font-normal text-text-muted", children: "/jam" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-body-sm text-text-secondary", children: "Durasi minimal" }),
        /* @__PURE__ */ jsxs("dd", { className: "text-body-sm tnum text-text", children: [
          (rules == null ? void 0 : rules.minDurationMinutes) ?? "—",
          " menit"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-body-sm text-text-secondary", children: "Pembulatan durasi" }),
        /* @__PURE__ */ jsxs("dd", { className: "text-body-sm tnum text-text", children: [
          (rules == null ? void 0 : rules.roundingMinutes) ?? "—",
          " menit"
        ] })
      ] }),
      (business == null ? void 0 : business.address) && /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3 border-t border-border pt-3", children: [
        /* @__PURE__ */ jsxs("dt", { className: "flex items-center gap-1.5 text-body-sm text-text-secondary", children: [
          /* @__PURE__ */ jsx(MapPin, { className: "size-4 shrink-0 text-text-muted", "aria-hidden": "true" }),
          "Alamat"
        ] }),
        /* @__PURE__ */ jsx("dd", { className: "max-w-[60%] text-right text-body-sm text-text", children: business.address })
      ] })
    ] }) }) })
  ] });
}
function selectCardColumns(columns) {
  const mobile = columns.filter((c) => !c.hideOnMobile);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const prominent = mobile.find((c) => c.prominentOnMobile);
  const cardCols = mobile.filter((c) => c.key !== primary.key && c.key !== (prominent == null ? void 0 : prominent.key)).slice(0, 3);
  return { primary, prominent, cardCols };
}
const UNIT_CARD_LAYOUT = {
  code: { key: "code", primary: true },
  type: { key: "type" },
  room: { key: "room" },
  controllers: { key: "controllers", hideOnMobile: true },
  rate: { key: "rate", prominentOnMobile: true },
  status: { key: "status" }
};
function rowName(row, rowLabel, primaryText) {
  return (rowLabel == null ? void 0 : rowLabel(row)) ?? (primaryText == null ? void 0 : primaryText(row)) ?? "Buka detail";
}
const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center"
};
function DataTable({
  columns,
  rows,
  rowKey,
  loading = false,
  skeletonRows = 5,
  empty,
  error,
  onRowClick,
  rowLabel,
  rowActions,
  selectable,
  selectedIds = [],
  onSelectedIdsChange,
  stickyHeader = true,
  sort,
  onSortChange
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(rowKey(r)));
  function toggleAll() {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(allSelected ? [] : rows.map(rowKey));
  }
  function toggleOne(id) {
    if (!onSelectedIdsChange) return;
    onSelectedIdsChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }
  function cycleSort(col) {
    if (!col.sortable || !onSortChange) return;
    const dir = (sort == null ? void 0 : sort.key) === col.key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: col.key, dir });
  }
  const { primary: primaryCol, prominent: prominentCol, cardCols } = selectCardColumns(columns);
  const header = /* @__PURE__ */ jsx("thead", { className: stickyHeader ? "sticky top-0 z-[var(--z-sticky)] bg-surface-2 shadow-e1" : "bg-surface-2", children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-border", children: [
    selectable && /* @__PURE__ */ jsx("th", { scope: "col", className: "w-12 px-3 py-2.5", children: /* @__PURE__ */ jsx(
      "input",
      {
        type: "checkbox",
        checked: allSelected,
        onChange: toggleAll,
        "aria-label": "Pilih semua baris",
        className: "size-5 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
      }
    ) }),
    columns.map((col) => {
      const isSorted = (sort == null ? void 0 : sort.key) === col.key;
      const canSort = col.sortable && onSortChange;
      return /* @__PURE__ */ jsx(
        "th",
        {
          scope: "col",
          style: col.width ? { width: col.width } : void 0,
          className: [
            "px-3 py-2.5 text-label font-medium text-text-secondary",
            ALIGN[col.align ?? (col.numeric ? "right" : "left")]
          ].join(" "),
          children: canSort ? /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => cycleSort(col),
              "aria-sort": isSorted ? (sort == null ? void 0 : sort.dir) === "asc" ? "ascending" : "descending" : "none",
              className: [
                "inline-flex items-center gap-1 rounded-[var(--radius-sm)] hover:text-text",
                col.align === "right" || col.numeric ? "flex-row-reverse" : ""
              ].join(" "),
              children: [
                col.header,
                isSorted ? (sort == null ? void 0 : sort.dir) === "asc" ? /* @__PURE__ */ jsx(ArrowUp, { className: "size-3.5", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ArrowDown, { className: "size-3.5", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ChevronsUpDown, { className: "size-3.5 text-text-muted", "aria-hidden": "true" })
              ]
            }
          ) : col.header
        },
        col.key
      );
    }),
    rowActions && /* @__PURE__ */ jsx("th", { scope: "col", className: "w-px px-3 py-2.5", children: /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Aksi" }) })
  ] }) });
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3", children: [
    error && /* @__PURE__ */ jsxs("div", { role: "alert", className: "flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 size-4 shrink-0", "aria-hidden": "true" }),
      /* @__PURE__ */ jsx("span", { children: error })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border sm:block lg:max-h-[70dvh] lg:overflow-auto", children: [
      /* @__PURE__ */ jsxs("table", { className: "w-full border-collapse text-body-sm", children: [
        header,
        /* @__PURE__ */ jsx("tbody", { children: loading ? Array.from({ length: skeletonRows }).map((_, i) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-border last:border-0", children: [
          selectable && /* @__PURE__ */ jsx("td", { className: "px-3 py-3", children: /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: "w-5" }) }),
          columns.map((col) => /* @__PURE__ */ jsx("td", { className: "px-3 py-3", children: /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: col.primary ? "w-2/3" : "w-1/2" }) }, col.key)),
          rowActions && /* @__PURE__ */ jsx("td", { className: "px-3 py-3", children: /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: "ml-auto w-16" }) })
        ] }, `sk-${i}`)) : rows.map((row) => {
          const id = rowKey(row);
          const selected = selectedIds.includes(id);
          return /* @__PURE__ */ jsxs(
            "tr",
            {
              className: [
                "border-b border-border last:border-0 transition-colors duration-fast",
                onRowClick ? "cursor-pointer hover:bg-surface-hover" : "",
                selected ? "bg-accent-soft/40" : ""
              ].join(" "),
              ...onRowClick ? {
                tabIndex: 0,
                "aria-label": rowName(row, rowLabel, primaryCol.text),
                onClick: () => onRowClick(row),
                onKeyDown: (e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }
              } : {},
              children: [
                selectable && /* @__PURE__ */ jsx("td", { className: "px-3 py-3", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected,
                    onChange: () => toggleOne(id),
                    "aria-label": `Pilih baris ${id}`,
                    className: "size-5 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
                  }
                ) }),
                columns.map((col) => /* @__PURE__ */ jsx(
                  "td",
                  {
                    className: [
                      "px-3 py-3 text-text align-middle",
                      ALIGN[col.align ?? (col.numeric ? "right" : "left")],
                      col.numeric ? "tnum" : "",
                      col.primary ? "font-medium" : ""
                    ].join(" "),
                    children: col.render(row)
                  },
                  col.key
                )),
                rowActions && /* @__PURE__ */ jsx("td", { className: "px-3 py-3", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx("div", { className: "flex items-center justify-end gap-1", children: rowActions(row) }) })
              ]
            },
            id
          );
        }) })
      ] }),
      !loading && rows.length === 0 && /* @__PURE__ */ jsx("div", { className: "p-6", children: empty })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2 sm:hidden", children: [
      loading ? Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => /* @__PURE__ */ jsxs("div", { className: "rounded-[var(--radius-lg)] border border-border bg-surface p-4", children: [
        /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: "w-1/2" }),
        /* @__PURE__ */ jsx(Skeleton, { variant: "text", lines: 2, className: "mt-3" })
      ] }, `msk-${i}`)) : rows.map((row) => {
        const id = rowKey(row);
        const selected = selectedIds.includes(id);
        return (
          // A plain div: the card itself is not a control, so the action
          // buttons inside it are no longer nested in a button-role element.
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: [
                "rounded-[var(--radius-lg)] border bg-surface p-4",
                selected ? "border-border-strong" : "border-border"
              ].join(" "),
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 items-start gap-3", children: [
                    selectable && /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "checkbox",
                        checked: selected,
                        onChange: () => toggleOne(id),
                        "aria-label": `Pilih baris ${id}`,
                        className: "mt-1 size-5 shrink-0 rounded-[var(--radius-sm)] accent-[var(--color-accent)]"
                      }
                    ),
                    /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children: onRowClick ? /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => onRowClick(row),
                        "aria-label": rowName(row, rowLabel, primaryCol.text),
                        className: "inline-flex min-h-11 w-full items-center text-left font-semibold text-text",
                        children: primaryCol.render(row)
                      }
                    ) : /* @__PURE__ */ jsx("span", { className: "text-body font-semibold text-text", children: primaryCol.render(row) }) })
                  ] }),
                  prominentCol && /* @__PURE__ */ jsx("div", { className: "shrink-0 text-right text-h2 font-bold tnum text-text", children: prominentCol.render(row) })
                ] }),
                cardCols.length > 0 && /* @__PURE__ */ jsx("dl", { className: "mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5", children: cardCols.map((col) => /* @__PURE__ */ jsxs("div", { className: "contents", children: [
                  /* @__PURE__ */ jsx("dt", { className: "text-caption text-text-muted", children: col.header }),
                  /* @__PURE__ */ jsx("dd", { className: ["text-body-sm text-text-secondary", col.numeric ? "tnum text-right" : ""].join(" "), children: col.render(row) })
                ] }, col.key)) }),
                rowActions && /* @__PURE__ */ jsx("div", { className: "mt-3 flex items-center gap-2 border-t border-border pt-3", children: rowActions(row) })
              ]
            },
            id
          )
        );
      }),
      !loading && rows.length === 0 && /* @__PURE__ */ jsx("div", { className: "rounded-[var(--radius-lg)] border border-border bg-surface p-4", children: empty })
    ] })
  ] });
}
function estimateCost(durationMinutes, hourlyRate, roundingMinutes) {
  const step = roundingMinutes > 0 ? roundingMinutes : 1;
  const billable = Math.ceil(durationMinutes / step) * step;
  return Math.ceil(billable * hourlyRate / 60);
}
const DURATION_CHIPS = [60, 90, 120, 180];
function canCancel(b) {
  return ["pending", "confirmed"].includes(effectiveBookingStatus(b));
}
function BookingSaya() {
  var _a, _b, _c, _d;
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();
  const list = useAsync(() => bookings.list(), []);
  const units = useAsync(() => consoles.listPublic(), []);
  const cfg = useAsync(() => settings.getPublic(), []);
  const [draft, setDraft] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const unitOf = (consoleId) => {
    var _a2;
    return (_a2 = units.data) == null ? void 0 : _a2.items.find((u) => u.id === consoleId);
  };
  const codeOf = (consoleId) => {
    var _a2;
    return ((_a2 = unitOf(consoleId)) == null ? void 0 : _a2.code) ?? "—";
  };
  const rounding = ((_a = cfg.data) == null ? void 0 : _a.rules.roundingMinutes) ?? 15;
  const minMinutes = ((_b = cfg.data) == null ? void 0 : _b.rules.minDurationMinutes) ?? 30;
  const isCustomer = (user == null ? void 0 : user.role) === "user";
  useEffect(() => {
    if (!params.get("buat") || !user) return;
    setParams({}, { replace: true });
    setDraft({
      consoleId: "",
      customerName: user.fullName,
      customerContact: user.phone ?? "",
      bookingDate: toJakartaDateStr(),
      startTime: "19:00",
      durationMinutes: String(minMinutes)
    });
  }, [params, setParams, user, minMinutes]);
  useEffect(() => {
    setDraft((d) => d && Number(d.durationMinutes) < minMinutes ? { ...d, durationMinutes: String(minMinutes) } : d);
  }, [minMinutes]);
  function openForm() {
    setDraft({
      consoleId: "",
      customerName: (user == null ? void 0 : user.fullName) ?? "",
      customerContact: (user == null ? void 0 : user.phone) ?? "",
      bookingDate: toJakartaDateStr(),
      startTime: "19:00",
      durationMinutes: String(minMinutes)
    });
  }
  async function submit() {
    if (!draft) return;
    const minutes = Number(draft.durationMinutes);
    if (!draft.consoleId || draft.customerName.trim().length < 2 || !Number.isFinite(minutes) || minutes < minMinutes) return;
    setBusy(true);
    try {
      await bookings.create({
        consoleId: draft.consoleId,
        customerName: draft.customerName.trim(),
        customerContact: draft.customerContact.trim() || void 0,
        bookingDate: draft.bookingDate,
        startTime: draft.startTime,
        durationMinutes: minutes
      });
      success("Booking berhasil dibuat. Booking menunggu konfirmasi admin.");
      setDraft(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage());
    } finally {
      setBusy(false);
    }
  }
  async function handleCancel(reason) {
    if (!cancelTarget) return;
    try {
      await bookings.cancel(cancelTarget.id, reason);
      success("Booking dibatalkan.");
      setCancelTarget(null);
      void list.reload();
    } catch (e) {
      toastError(errorMessage());
    }
  }
  const columns = [
    {
      key: "date",
      header: "Tanggal",
      primary: true,
      text: (b) => `Booking ${formatJakarta(`${b.bookingDate}T00:00:00+07:00`, "date")} ${b.startTime}`,
      render: (b) => /* @__PURE__ */ jsxs("span", { children: [
        formatJakarta(`${b.bookingDate}T00:00:00+07:00`, "date"),
        /* @__PURE__ */ jsxs("span", { className: "sm:hidden", children: [
          " · ",
          b.startTime
        ] })
      ] })
    },
    { key: "time", header: "Waktu", hideOnMobile: true, render: (b) => b.startTime },
    { key: "duration", header: "Durasi", numeric: true, render: (b) => formatDurationShort(b.durationMinutes) },
    {
      key: "console",
      header: "Unit",
      render: (b) => /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(Gamepad2, { className: "size-4 text-text-muted", "aria-hidden": "true" }),
        codeOf(b.consoleId)
      ] })
    },
    {
      key: "estimate",
      header: "Estimasi",
      numeric: true,
      prominentOnMobile: true,
      render: (b) => {
        const unit = unitOf(b.consoleId);
        if (!unit) return "—";
        return formatIDR(estimateCost(b.durationMinutes, unit.hourlyRate, rounding));
      }
    },
    {
      key: "status",
      header: "Status",
      render: (b) => /* @__PURE__ */ jsx(StatusBadge, { value: effectiveBookingStatus(b), map: EFFECTIVE_BOOKING_STATUS })
    }
  ];
  const rows = ((_c = list.data) == null ? void 0 : _c.items) ?? [];
  const unitOptions = (((_d = units.data) == null ? void 0 : _d.items) ?? []).map((u) => ({
    value: u.id,
    label: `${u.code} · ${u.consoleType} ${u.roomType} · ${formatIDR(u.hourlyRate)}/jam`
  }));
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Booking Saya",
        subtitle: "Riwayat dan jadwal booking Anda."
      }
    ),
    /* @__PURE__ */ jsxs(PageSection, { children: [
      /* @__PURE__ */ jsx(
        DataTable,
        {
          columns,
          rows,
          rowKey: (b) => b.id,
          loading: list.loading,
          error: list.error,
          rowLabel: (b) => `Booking ${formatJakarta(`${b.bookingDate}T00:00:00+07:00`, "date")} ${b.startTime}`,
          empty: /* @__PURE__ */ jsx(
            EmptyState,
            {
              icon: /* @__PURE__ */ jsx(CalendarX, { className: "size-8", "aria-hidden": "true" }),
              title: "Belum ada booking",
              description: "Buat booking pertama Anda dan pilih unit yang tersedia.",
              primaryAction: /* @__PURE__ */ jsx(Button, { onClick: openForm, children: "Buat booking" })
            }
          ),
          rowActions: (b) => canCancel(b) ? /* @__PURE__ */ jsx(
            Button,
            {
              size: "sm",
              variant: "danger",
              iconLeft: /* @__PURE__ */ jsx(X, { className: "size-4", "aria-hidden": "true" }),
              onClick: () => setCancelTarget(b),
              children: "Batalkan"
            }
          ) : null
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-caption text-text-muted", children: "Estimasi memakai tarif unit dan pembulatan durasi. Biaya final dihitung server saat check-in." })
    ] }),
    rows.length > 0 && /* @__PURE__ */ jsx("div", { className: "h-[4.5rem] lg:hidden", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx(StickyActionBar, { visible: rows.length > 0, children: /* @__PURE__ */ jsx(Button, { iconLeft: /* @__PURE__ */ jsx(CalendarPlus, { className: "size-4", "aria-hidden": "true" }), onClick: openForm, children: "Buat booking" }) }),
    /* @__PURE__ */ jsx(
      Modal,
      {
        open: draft !== null,
        onOpenChange: (v) => !v && setDraft(null),
        title: "Buat booking",
        description: "Booking baru berstatus menunggu konfirmasi admin.",
        footer: /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Button, { variant: "ghost", onClick: () => setDraft(null), disabled: busy, children: "Batal" }),
          /* @__PURE__ */ jsx(
            Button,
            {
              onClick: () => void submit(),
              loading: busy,
              loadingText: "Mengirim…",
              disabled: !(draft == null ? void 0 : draft.consoleId) || ((draft == null ? void 0 : draft.customerName.trim().length) ?? 0) < 2 || (Number(draft == null ? void 0 : draft.durationMinutes) || 0) < minMinutes,
              children: "Kirim booking"
            }
          )
        ] }),
        children: draft && /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
          /* @__PURE__ */ jsx("p", { className: "text-caption text-text-muted", children: "* wajib diisi" }),
          /* @__PURE__ */ jsx(
            Select,
            {
              label: "Unit",
              options: unitOptions,
              value: draft.consoleId,
              onChange: (e) => setDraft({ ...draft, consoleId: e.target.value }),
              placeholder: "Pilih unit",
              requiredMark: true
            }
          ),
          /* @__PURE__ */ jsx(
            Input,
            {
              label: "Tanggal",
              type: "date",
              min: toJakartaDateStr(),
              value: draft.bookingDate,
              onChange: (e) => setDraft({ ...draft, bookingDate: e.target.value }),
              requiredMark: true
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "grid gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsx(
              Input,
              {
                label: "Jam mulai",
                type: "time",
                value: draft.startTime,
                onChange: (e) => setDraft({ ...draft, startTime: e.target.value }),
                requiredMark: true
              }
            ),
            /* @__PURE__ */ jsx(
              Input,
              {
                label: "Durasi (menit)",
                inputMode: "numeric",
                value: draft.durationMinutes,
                onChange: (e) => setDraft({ ...draft, durationMinutes: e.target.value.replace(/[^\d]/g, "") }),
                helpText: `Minimal ${minMinutes} menit.`,
                error: Number(draft.durationMinutes) > 0 && Number(draft.durationMinutes) < minMinutes ? `Minimal ${minMinutes} menit.` : void 0,
                requiredMark: true
              }
            )
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: DURATION_CHIPS.map((m) => /* @__PURE__ */ jsx(
            Button,
            {
              size: "sm",
              variant: Number(draft.durationMinutes) === m ? "primary" : "secondary",
              onClick: () => setDraft({ ...draft, durationMinutes: String(m) }),
              children: formatDurationShort(m)
            },
            m
          )) }),
          /* @__PURE__ */ jsx(
            Input,
            {
              label: isCustomer ? "Nama pemesan" : "Nama pelanggan",
              value: draft.customerName,
              onChange: (e) => setDraft({ ...draft, customerName: e.target.value }),
              readOnly: isCustomer,
              maxLength: 60,
              helpText: isCustomer ? "Diambil dari akun Anda." : void 0,
              requiredMark: true
            }
          ),
          /* @__PURE__ */ jsx(
            Input,
            {
              label: "Kontak",
              type: "tel",
              inputMode: "tel",
              value: draft.customerContact,
              onChange: (e) => setDraft({ ...draft, customerContact: e.target.value }),
              maxLength: 40,
              helpText: "Opsional. Nomor yang bisa dihubungi."
            }
          )
        ] })
      }
    ),
    /* @__PURE__ */ jsx(
      ConfirmDialog,
      {
        open: cancelTarget !== null,
        onOpenChange: (v) => !v && setCancelTarget(null),
        title: "Batalkan booking?",
        description: cancelTarget ? `Booking tanggal ${formatJakarta(`${cancelTarget.bookingDate}T00:00:00+07:00`, "date")} pukul ${cancelTarget.startTime} akan dibatalkan.` : void 0,
        confirmLabel: "Batalkan booking",
        tone: "destructive",
        reason: { label: "Alasan pembatalan", placeholder: "mis. jadwal berubah", optional: true },
        onConfirm: handleCancel
      }
    )
  ] });
}
function Tabs({ items, value, onChange, variant = "underline", idPrefix }) {
  const autoId = useId();
  const baseId = idPrefix ?? autoId;
  const listRef = useRef(null);
  function onKeyDown(e) {
    var _a, _b;
    const enabled = items.filter((i) => !i.disabled);
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((i) => i.value === value);
    let next;
    if (e.key === "ArrowRight") next = enabled[(idx + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    (_b = (_a = listRef.current) == null ? void 0 : _a.querySelector(`#${CSS.escape(`${baseId}-tab-${next.value}`)}`)) == null ? void 0 : _b.focus();
  }
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: listRef,
      role: "tablist",
      onKeyDown,
      className: [
        "flex items-center gap-1 overflow-x-auto",
        variant === "underline" ? "border-b border-border" : "rounded-[var(--radius-full)] bg-surface p-1"
      ].join(" "),
      children: items.map((item) => {
        const active = item.value === value;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            id: `${baseId}-tab-${item.value}`,
            role: "tab",
            type: "button",
            "aria-selected": active,
            "aria-controls": idPrefix ? `${baseId}-panel-${item.value}` : void 0,
            tabIndex: active ? 0 : -1,
            disabled: item.disabled,
            onClick: () => onChange(item.value),
            className: [
              "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-body-sm font-medium transition-colors duration-fast",
              "disabled:cursor-not-allowed disabled:opacity-50",
              variant === "underline" ? active ? "border-b-2 border-accent text-text" : "border-b-2 border-transparent text-text-secondary hover:text-text" : active ? "rounded-[var(--radius-full)] bg-accent text-white" : "rounded-[var(--radius-full)] text-text-secondary hover:text-text"
            ].join(" "),
            children: [
              item.label,
              item.count !== void 0 && /* @__PURE__ */ jsx(
                "span",
                {
                  className: [
                    "tnum rounded-[var(--radius-full)] px-1.5 text-caption",
                    active && variant === "pill" ? "bg-white/20" : "bg-surface-hover text-text-secondary"
                  ].join(" "),
                  children: item.count
                }
              )
            ]
          },
          item.value
        );
      })
    }
  );
}
function TabPanel({ id, value: _value, children, hidden }) {
  return /* @__PURE__ */ jsx("div", { role: "tabpanel", id, "aria-labelledby": id.replace("-panel-", "-tab-"), tabIndex: 0, hidden, className: "outline-none", children });
}
const TABS = [
  { value: "unit", label: "Unit" },
  { value: "paket", label: "Paket Durasi" },
  { value: "game", label: "Game" }
];
const TABS_ID = "info-rental";
function InfoRental() {
  var _a, _b, _c;
  const [tab, setTab] = useState("unit");
  const units = useAsync(() => consoles.listPublic(), []);
  const packages = useAsync(() => settings.packages(), []);
  const catalog = useAsync(() => games.list(), []);
  const loading = units.loading || packages.loading || catalog.loading;
  const error = units.error ?? packages.error ?? catalog.error;
  const unitColumns = [
    {
      ...UNIT_CARD_LAYOUT.code,
      header: "Unit",
      text: (u) => `Unit ${u.code}`,
      render: (u) => /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(Gamepad2, { className: "size-4 text-text-muted", "aria-hidden": "true" }),
        u.code
      ] })
    },
    { ...UNIT_CARD_LAYOUT.type, header: "Tipe", render: (u) => u.consoleType },
    { ...UNIT_CARD_LAYOUT.room, header: "Ruangan", render: (u) => u.roomType },
    { ...UNIT_CARD_LAYOUT.controllers, header: "Controller", numeric: true, render: (u) => String(u.controllers) },
    { ...UNIT_CARD_LAYOUT.rate, header: "Tarif/jam", numeric: true, render: (u) => formatIDR(u.hourlyRate) },
    { ...UNIT_CARD_LAYOUT.status, header: "Status", render: (u) => /* @__PURE__ */ jsx(StatusBadge, { value: u.status, map: CONSOLE_STATUS }) }
  ];
  const packageColumns = [
    { key: "name", header: "Paket", primary: true, text: (p) => p.name, render: (p) => p.name },
    { key: "duration", header: "Durasi", numeric: true, render: (p) => formatDurationShort(p.durationMinutes) },
    { key: "type", header: "Tipe konsol", render: (p) => p.consoleType ?? "Semua tipe" },
    { key: "price", header: "Harga", numeric: true, prominentOnMobile: true, render: (p) => formatIDR(p.price) }
  ];
  const gameColumns = [
    { key: "title", header: "Judul", primary: true, text: (g) => g.title, render: (g) => g.title },
    { key: "platform", header: "Platform", render: (g) => /* @__PURE__ */ jsx(Badge, { tone: "neutral", children: PLATFORM_LABEL[g.platform] }) },
    { key: "genre", header: "Genre", render: (g) => g.genre },
    {
      key: "controllers",
      header: "Controller",
      numeric: true,
      hideOnMobile: true,
      render: (g) => g.recommendedControllers ? String(g.recommendedControllers) : "—"
    }
  ];
  if (loading) {
    return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-5", children: [
      /* @__PURE__ */ jsx(Skeleton, { variant: "text", className: "h-8 w-1/2" }),
      /* @__PURE__ */ jsx(Skeleton, { variant: "block" })
    ] });
  }
  if (error) {
    return /* @__PURE__ */ jsx(
      EmptyState,
      {
        variant: "error",
        headingLevel: 1,
        title: "Gagal memuat info rental",
        description: error,
        primaryAction: /* @__PURE__ */ jsx(Button, { onClick: () => {
          void units.reload();
          void packages.reload();
          void catalog.reload();
        }, children: "Coba lagi" })
      }
    );
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Info Rental", subtitle: "Unit, paket durasi, dan katalog game." }),
    /* @__PURE__ */ jsx(PageSection, { children: /* @__PURE__ */ jsx(Tabs, { items: TABS, value: tab, onChange: setTab, idPrefix: TABS_ID }) }),
    /* @__PURE__ */ jsx(TabPanel, { id: `${TABS_ID}-panel-unit`, value: "unit", hidden: tab !== "unit", children: /* @__PURE__ */ jsx(PageSection, { title: "Daftar unit", description: "Tarif per jam, sesuai tipe dan ruangan.", children: /* @__PURE__ */ jsx(
      DataTable,
      {
        columns: unitColumns,
        rows: ((_a = units.data) == null ? void 0 : _a.items) ?? [],
        rowKey: (u) => u.id,
        loading: units.loading,
        error: units.error,
        empty: /* @__PURE__ */ jsx(
          EmptyState,
          {
            icon: /* @__PURE__ */ jsx(Gamepad2, { className: "size-8", "aria-hidden": "true" }),
            title: "Belum ada unit",
            description: "Hubungi Admin untuk informasi unit terbaru."
          }
        )
      }
    ) }) }),
    /* @__PURE__ */ jsx(TabPanel, { id: `${TABS_ID}-panel-paket`, value: "paket", hidden: tab !== "paket", children: /* @__PURE__ */ jsx(PageSection, { title: "Paket durasi", description: "Harga tetap untuk durasi tertentu.", children: /* @__PURE__ */ jsx(
      DataTable,
      {
        columns: packageColumns,
        rows: (((_b = packages.data) == null ? void 0 : _b.items) ?? []).filter((p) => p.isActive),
        rowKey: (p) => p.id,
        loading: packages.loading,
        error: packages.error,
        empty: /* @__PURE__ */ jsx(
          EmptyState,
          {
            icon: /* @__PURE__ */ jsx(Package, { className: "size-8", "aria-hidden": "true" }),
            title: "Belum ada paket",
            description: "Paket durasi akan tampil di sini bila tersedia."
          }
        )
      }
    ) }) }),
    /* @__PURE__ */ jsx(TabPanel, { id: `${TABS_ID}-panel-game`, value: "game", hidden: tab !== "game", children: /* @__PURE__ */ jsx(PageSection, { title: "Katalog game", description: "Game yang bisa Anda mainkan di unit.", children: /* @__PURE__ */ jsx(
      DataTable,
      {
        columns: gameColumns,
        rows: ((_c = catalog.data) == null ? void 0 : _c.items) ?? [],
        rowKey: (g) => g.id,
        loading: catalog.loading,
        error: catalog.error,
        empty: /* @__PURE__ */ jsx(
          EmptyState,
          {
            icon: /* @__PURE__ */ jsx(Ticket, { className: "size-8", "aria-hidden": "true" }),
            title: "Belum ada game",
            description: "Katalog game akan tampil di sini bila tersedia."
          }
        )
      }
    ) }) })
  ] });
}
function Akun() {
  const { user, setUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [fullName, setFullName] = useState((user == null ? void 0 : user.fullName) ?? "");
  const [phone, setPhone] = useState((user == null ? void 0 : user.phone) ?? "");
  const [saving, setSaving] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  useEffect(() => {
    setFullName((user == null ? void 0 : user.fullName) ?? "");
    setPhone((user == null ? void 0 : user.phone) ?? "");
  }, [user == null ? void 0 : user.fullName, user == null ? void 0 : user.phone]);
  async function save() {
    if (!user) return;
    if (fullName.trim().length < 2) {
      toastError("Nama lengkap minimal 2 karakter.");
      return;
    }
    setSaving(true);
    try {
      const { user: updated } = await auth.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || null
      });
      setUser(updated);
      success("Profil berhasil disimpan.");
    } catch (e) {
      toastError(errorMessage());
    } finally {
      setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Profil", subtitle: "Data akun dan keamanan Anda." }),
    /* @__PURE__ */ jsx(PageSection, { title: "Data akun", children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-caption text-text-muted", children: "* wajib diisi" }),
      /* @__PURE__ */ jsx(
        Input,
        {
          label: "Nama lengkap",
          value: fullName,
          onChange: (e) => setFullName(e.target.value),
          maxLength: 80,
          requiredMark: true
        }
      ),
      /* @__PURE__ */ jsx(
        Input,
        {
          label: "Nomor HP",
          type: "tel",
          inputMode: "tel",
          value: phone,
          onChange: (e) => setPhone(e.target.value),
          maxLength: 40,
          helpText: "Opsional. Dipakai Admin saat menghubungi Anda."
        }
      ),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(Button, { onClick: () => void save(), loading: saving, loadingText: "Menyimpan…", iconLeft: /* @__PURE__ */ jsx(Save, { className: "size-4", "aria-hidden": "true" }), children: "Simpan" }) })
    ] }) }) }),
    /* @__PURE__ */ jsx(PageSection, { title: "Keamanan", children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx("p", { className: "text-body-sm font-medium text-text", children: "Kata sandi" }),
        /* @__PURE__ */ jsx("p", { className: "text-caption text-text-muted", children: "Ganti sandi secara berkala untuk keamanan akun." })
      ] }),
      /* @__PURE__ */ jsx(Button, { variant: "secondary", iconLeft: /* @__PURE__ */ jsx(KeyRound, { className: "size-4", "aria-hidden": "true" }), onClick: () => setPwdOpen(true), children: "Ubah kata sandi" })
    ] }) }) }),
    /* @__PURE__ */ jsx(PageSection, { title: "Informasi akun", children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs("dl", { className: "flex flex-col gap-2 text-body-sm", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-text-secondary", children: "Nama pengguna" }),
        /* @__PURE__ */ jsx("dd", { className: "font-mono text-text", children: (user == null ? void 0 : user.username) ?? "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-text-secondary", children: "Peran" }),
        /* @__PURE__ */ jsx("dd", { className: "text-text", children: user ? ROLE_LABEL[user.role] : "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsx("dt", { className: "text-text-secondary", children: "Dibuat" }),
        /* @__PURE__ */ jsx("dd", { className: "text-text", children: user ? formatJakarta(user.createdAt, "date") : "—" })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx(ChangePasswordDialog, { open: pwdOpen, onOpenChange: setPwdOpen })
  ] });
}
const pages = { Beranda, BookingSaya, InfoRental, Akun };
let failed = 0;
for (const mode2 of ["data", "empty", "error", "loading"]) {
  setMode(mode2);
  for (const [name, Page] of Object.entries(pages)) {
    try {
      const html = renderToString(
        /* @__PURE__ */ jsx(MemoryRouter, { children: /* @__PURE__ */ jsx(AuthProvider, { children: /* @__PURE__ */ jsx(ToastProvider, { children: /* @__PURE__ */ jsx(Page, {}) }) }) })
      );
      const marker = mode2 === "data" ? "ok  " : "ok  ";
      process.stdout.write(`${marker} ${mode2.padEnd(7)} ${name.padEnd(12)} ${String(html.length).padStart(6)} chars
`);
    } catch (e) {
      failed += 1;
      process.stdout.write(`FAIL ${mode2} ${name}: ${e.message}
`);
    }
  }
}
process.stdout.write(failed === 0 ? "\nall renders passed\n" : `
${failed} render(s) failed
`);
process.exit(failed === 0 ? 0 : 1);
