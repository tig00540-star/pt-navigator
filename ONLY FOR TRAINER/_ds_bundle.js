/* @ds-bundle: {"format":4,"namespace":"DesignSystem_ac3846","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"MemberCard","sourcePath":"components/data/MemberCard.jsx"},{"name":"StatCard","sourcePath":"components/data/StatCard.jsx"},{"name":"TodoItem","sourcePath":"components/data/TodoItem.jsx"},{"name":"AIBriefBlock","sourcePath":"components/feedback/AIBriefBlock.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"WorkflowTabBar","sourcePath":"components/navigation/WorkflowTabBar.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"a96d1b088007","components/core/Button.jsx":"2e3d8b01b373","components/core/Card.jsx":"35e6a4b0542f","components/core/Chip.jsx":"10293f73594a","components/core/Icon.jsx":"dfc94d41cd7e","components/core/IconButton.jsx":"65383851aaf6","components/data/MemberCard.jsx":"374165bfe1e5","components/data/StatCard.jsx":"0f5f19e174e9","components/data/TodoItem.jsx":"45fce92fe8c4","components/feedback/AIBriefBlock.jsx":"5e77fd36e73c","components/feedback/EmptyState.jsx":"50671736a161","components/feedback/Modal.jsx":"98c00589d0b1","components/feedback/ProgressBar.jsx":"f1b10ea55fb2","components/feedback/Toast.jsx":"400ce8a721fb","components/forms/Checkbox.jsx":"85ea44bca4f3","components/forms/Input.jsx":"5e883eb02acb","components/forms/Select.jsx":"bbfe435dce9e","components/forms/Textarea.jsx":"e3af07fac02a","components/navigation/BottomNav.jsx":"90b763a8f345","components/navigation/WorkflowTabBar.jsx":"0bbfa43c1cfb","ui_kits/admin/AdminApp.jsx":"06a3f9c78778","ui_kits/member/MemberApp.jsx":"6f226b45dbfa","ui_kits/trainer/TrainerApp.jsx":"0b6e2ea8334b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_ac3846 = window.DesignSystem_ac3846 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* 상태·역할 뱃지. tone은 역할 색 체계를 따른다.
 * ot=amber, pt=sky, admin=fuchsia, danger=rose, red=브랜드(활성), neutral, success. */
const TONES = {
  neutral: {
    bg: "var(--sunken)",
    fg: "var(--text-sub)",
    bd: "transparent"
  },
  red: {
    bg: "var(--red-soft)",
    fg: "var(--red-strong)",
    bd: "transparent"
  },
  ot: {
    bg: "var(--ot-soft)",
    fg: "var(--ot-text)",
    bd: "transparent"
  },
  pt: {
    bg: "var(--pt-soft)",
    fg: "var(--pt-text)",
    bd: "transparent"
  },
  admin: {
    bg: "var(--admin-soft)",
    fg: "var(--admin-text)",
    bd: "transparent"
  },
  danger: {
    bg: "transparent",
    fg: "var(--danger-text)",
    bd: "var(--danger)"
  },
  success: {
    bg: "transparent",
    fg: "var(--success-text)",
    bd: "var(--success)"
  }
};
function Badge({
  tone = "neutral",
  children,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      fontFamily: "var(--font-sans)",
      fontSize: "11.5px",
      fontWeight: "var(--fw-bold)",
      letterSpacing: "-.01em",
      lineHeight: 1,
      padding: "4px 9px",
      borderRadius: "var(--radius-pill)",
      background: t.bg,
      color: t.fg,
      boxShadow: t.bd === "transparent" ? "none" : `inset 0 0 0 1px ${t.bd}`,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Card — 흰 면, 얕은 그림자 한 종류, 14~16px 라운드.
 * selected는 레드 소프트 배경 + 레드 테두리(선택된 행). */
function Card({
  as: Tag = "div",
  padding = "var(--pad-card)",
  interactive = false,
  selected = false,
  elevated = true,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      background: selected ? "var(--surface-selected)" : "var(--surface-card)",
      border: `1px solid ${selected ? "var(--red)" : "var(--border)"}`,
      borderRadius: "var(--radius-card)",
      boxShadow: elevated ? "var(--shadow-card)" : "none",
      padding,
      cursor: interactive ? "pointer" : undefined,
      transition: "border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
      ...style
    },
    onMouseEnter: interactive ? e => {
      e.currentTarget.style.boxShadow = "var(--shadow-pop)";
    } : undefined,
    onMouseLeave: interactive ? e => {
      e.currentTarget.style.boxShadow = elevated ? "var(--shadow-card)" : "none";
    } : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const LUCIDE = "https://unpkg.com/lucide-static@0.544.0/icons/";

/* Icon — thin wrapper over Lucide (brand's chosen icon set).
 * Renders the real Lucide SVG via CSS mask so it inherits currentColor.
 * Default stroke weight is kept per brand guideline. */
function Icon({
  name,
  size = 20,
  color,
  style,
  className,
  ...rest
}) {
  const url = `${LUCIDE}${name}.svg`;
  return /*#__PURE__*/React.createElement("span", _extends({
    role: "img",
    "aria-hidden": "true",
    className: className,
    style: {
      display: "inline-block",
      flex: "none",
      width: size,
      height: size,
      backgroundColor: color || "currentColor",
      WebkitMask: `url("${url}") center / contain no-repeat`,
      mask: `url("${url}") center / contain no-repeat`,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    fontSize: "13px",
    padding: "7px 12px",
    gap: "6px",
    icon: 16
  },
  md: {
    fontSize: "14.5px",
    padding: "11px 16px",
    gap: "8px",
    icon: 18
  },
  lg: {
    fontSize: "16px",
    padding: "14px 20px",
    gap: "9px",
    icon: 20
  }
};
function variantStyle(variant) {
  switch (variant) {
    case "secondary":
      return {
        background: "var(--surface-card)",
        color: "var(--text-body)",
        boxShadow: "inset 0 0 0 1px var(--border-strong)"
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--text-body)",
        boxShadow: "none"
      };
    case "danger":
      return {
        background: "transparent",
        color: "var(--danger-text)",
        boxShadow: "inset 0 0 0 1px var(--danger)"
      };
    case "primary":
    default:
      return {
        background: "var(--accent)",
        color: "var(--text-on-red)",
        boxShadow: "none"
      };
  }
}

/* Button — 레드 채움은 '누르는 곳'. primary만 브랜드 레드 면을 쓴다. */
function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  type = "button",
  children,
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    style: {
      display: fullWidth ? "flex" : "inline-flex",
      width: fullWidth ? "100%" : undefined,
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      fontFamily: "var(--font-sans)",
      fontWeight: "var(--fw-bold)",
      fontSize: s.fontSize,
      letterSpacing: "-.02em",
      lineHeight: 1,
      padding: s.padding,
      border: "none",
      borderRadius: "var(--radius-control)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--dur) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...variantStyle(variant),
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = "translateY(1px)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "translateY(0)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = "translateY(0)";
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: s.icon
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: s.icon
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Chip — 필터·선택 칩. 선택 시 레드 소프트 배경 + 레드 테두리 + 레드 텍스트.
 * 목록 필터(상태 필터 칩)에서 쓴다. */
function Chip({
  selected = false,
  icon,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-pressed": selected,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontFamily: "var(--font-sans)",
      fontSize: "13px",
      fontWeight: selected ? "var(--fw-bold)" : "var(--fw-medium)",
      letterSpacing: "-.015em",
      lineHeight: 1,
      padding: "8px 13px",
      borderRadius: "var(--radius-pill)",
      cursor: "pointer",
      color: selected ? "var(--red-strong)" : "var(--text-sub)",
      background: selected ? "var(--red-soft)" : "var(--surface-card)",
      boxShadow: `inset 0 0 0 1px ${selected ? "var(--red)" : "var(--border)"}`,
      transition: "all var(--dur) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15
  }), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 38,
  lg: 44
};
const ICON = {
  sm: 16,
  md: 20,
  lg: 22
};

/* IconButton — 아이콘 단독 정사각 버튼 (헤더 벨, 확대, 삭제 등). */
function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  disabled = false,
  style,
  ...rest
}) {
  const dim = SIZES[size] || SIZES.md;
  const filled = variant === "primary";
  const danger = variant === "danger";
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: "var(--radius-control)",
      border: "none",
      background: filled ? "var(--accent)" : "transparent",
      color: filled ? "var(--text-on-red)" : danger ? "var(--danger-text)" : "var(--text-sub)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--dur) var(--ease-out), color var(--dur) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    },
    onMouseEnter: e => {
      if (!filled && !disabled) e.currentTarget.style.background = "var(--sunken)";
    },
    onMouseLeave: e => {
      if (!filled) e.currentTarget.style.background = "transparent";
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: ICON[size] || ICON.md
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/MemberCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* MemberCard — 회원 목록의 행. 이름 · 상태 뱃지 · 요약. 클릭 시 워크플로우로. */
const STATUS = {
  ot: {
    tone: "ot",
    label: "OT 진행"
  },
  pt: {
    tone: "pt",
    label: "PT 등록"
  },
  inactive: {
    tone: "neutral",
    label: "종결"
  }
};
function MemberCard({
  name,
  status = "ot",
  summary,
  meta,
  selected = false,
  onClick,
  style,
  ...rest
}) {
  const st = STATUS[status] || STATUS.ot;
  const initial = (name || "?").trim().charAt(0);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "13px",
      width: "100%",
      textAlign: "left",
      padding: "13px 15px",
      background: selected ? "var(--surface-selected)" : "var(--surface-card)",
      border: `1px solid ${selected ? "var(--red)" : "var(--border)"}`,
      borderRadius: "var(--radius-card)",
      cursor: "pointer",
      transition: "border-color var(--dur) var(--ease-out), background var(--dur) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 40,
      height: 40,
      flex: "none",
      borderRadius: "var(--radius-pill)",
      background: "var(--sunken)",
      fontSize: "16px",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-sub)"
    }
  }, initial), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "15.5px",
      fontWeight: "var(--fw-bold)",
      letterSpacing: "-.03em",
      color: "var(--text-heading)"
    }
  }, name), /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: st.tone
  }, st.label)), summary && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: "13px",
      color: "var(--text-sub)",
      marginTop: "2px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, summary)), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12px",
      color: "var(--text-muted)",
      flex: "none",
      fontVariantNumeric: "tabular-nums"
    }
  }, meta), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--text-muted)",
    style: {
      flex: "none"
    }
  }));
}
Object.assign(__ds_scope, { MemberCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/MemberCard.jsx", error: String((e && e.message) || e) }); }

// components/data/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* StatCard — 지표 카드. 금액 기본은 먹색.
 * emphasis="hero"는 화면당 하나뿐인 헤드라인 금액에만 (레드 텍스트). */
function StatCard({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  emphasis = "normal",
  icon,
  style,
  ...rest
}) {
  const hero = emphasis === "hero";
  const deltaColor = deltaTone === "up" ? "var(--success-text)" : deltaTone === "down" ? "var(--danger-text)" : "var(--text-muted)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      padding: "16px 18px",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "11px",
      fontWeight: "var(--fw-bold)",
      letterSpacing: ".13em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "4px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: hero ? "28px" : "23px",
      fontWeight: hero ? "var(--fw-extrabold)" : "var(--fw-bold)",
      letterSpacing: "-.03em",
      fontVariantNumeric: "tabular-nums",
      color: hero ? "var(--text-money-hero)" : "var(--text-money)",
      lineHeight: 1.1
    }
  }, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "14px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-sub)"
    }
  }, unit)), delta && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "3px",
      fontSize: "12.5px",
      fontWeight: "var(--fw-semibold)",
      color: deltaColor,
      fontVariantNumeric: "tabular-nums"
    }
  }, deltaTone !== "neutral" && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: deltaTone === "up" ? "trending-up" : "trending-down",
    size: 14
  }), delta));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data/TodoItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* TodoItem — '오늘' 화면 자동 감지 할 일. 누르면 해당 작업 탭으로 이동.
 * kind: 미처리예약 · 오늘재접근 · 미확정클로징 · 재등록도래 · 재등록재접근 */
const KINDS = {
  appointment: {
    icon: "calendar-clock",
    tone: "var(--text-sub)"
  },
  reapproach: {
    icon: "rotate-ccw",
    tone: "var(--ot-text)"
  },
  unclosed: {
    icon: "flag",
    tone: "var(--red-strong)"
  },
  renewal: {
    icon: "refresh-cw",
    tone: "var(--pt-text)"
  },
  "renewal-reapproach": {
    icon: "rotate-ccw",
    tone: "var(--pt-text)"
  }
};
function TodoItem({
  kind = "appointment",
  title,
  detail,
  onClick,
  style,
  ...rest
}) {
  const k = KINDS[kind] || KINDS.appointment;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      width: "100%",
      textAlign: "left",
      padding: "13px 14px",
      background: "var(--surface-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-control)",
      cursor: "pointer",
      transition: "border-color var(--dur) var(--ease-out)",
      WebkitTapHighlightColor: "transparent",
      ...style
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = "var(--border-strong)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = "var(--border)";
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 34,
      height: 34,
      flex: "none",
      borderRadius: "9px",
      background: "var(--sunken)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: k.icon,
    size: 17,
    color: k.tone
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: "14.5px",
      fontWeight: "var(--fw-semibold)",
      letterSpacing: "-.02em",
      color: "var(--text-body)"
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: "12.5px",
      color: "var(--text-muted)",
      marginTop: "1px"
    }
  }, detail)), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--text-muted)",
    style: {
      flex: "none"
    }
  }));
}
Object.assign(__ds_scope, { TodoItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/TodoItem.jsx", error: String((e && e.message) || e) }); }

// components/feedback/AIBriefBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* AIBriefBlock — AI 사전무장/브리핑 블록. 제품의 심장.
 * status: idle | loading | ready | stale | demo
 * loading은 45초~1분 걸리므로 진행 표시와 대기 안내를 반드시 노출한다. */
function AIBriefBlock({
  status = "ready",
  title = "AI 사전무장",
  waitingHint = "약 45초 걸립니다. 들어가기 전에 회원 기록을 다시 훑어보세요.",
  onGenerate,
  onRegenerate,
  children,
  style,
  ...rest
}) {
  const header = /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
      marginBottom: status === "idle" || status === "loading" ? 0 : "14px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "sparkles",
    size: 18,
    color: "var(--red)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "15px",
      fontWeight: "var(--fw-bold)",
      letterSpacing: "-.03em",
      color: "var(--text-heading)"
    }
  }, title), status === "stale" && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "ot"
  }, "\uAE30\uB85D \uBCC0\uACBD\uB428 \xB7 \uC7AC\uC0DD\uC131 \uAD8C\uC7A5"), status === "demo" && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "neutral"
  }, "\uB370\uBAA8")), (status === "ready" || status === "stale" || status === "demo") && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    icon: "refresh-cw",
    onClick: onRegenerate
  }, "\uC7AC\uC0DD\uC131"));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--surface-card)",
      border: `1px solid ${status === "stale" ? "var(--ot)" : "var(--border)"}`,
      borderLeft: `3px solid var(--red)`,
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      padding: "18px 20px 20px",
      ...style
    }
  }, rest), header, status === "idle" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "12px",
      paddingTop: "14px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "14px",
      color: "var(--text-sub)",
      lineHeight: 1.6,
      margin: 0
    }
  }, "\uBB38\uC9C4\uACFC \uD65C\uC131 \uD328\uD0A4\uC9C0\uB97C \uADFC\uAC70\uB85C \uC624\uD504\uB2DD\xB7\uD074\uB85C\uC9D5 \uB300\uC0AC\uC640 \uAC70\uC808 5\uC885 \uBC29\uC5B4\uB97C \uB9CC\uB4ED\uB2C8\uB2E4."), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    icon: "sparkles",
    onClick: onGenerate
  }, "\uBE0C\uB9AC\uD551 \uC0DD\uC131")), status === "loading" && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      marginBottom: "12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: 18,
    color: "var(--red)",
    style: {
      animation: "otSpin 1s linear infinite"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "14px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-body)"
    }
  }, "\uBE0C\uB9AC\uD551 \uC0DD\uC131 \uC911\u2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 6,
      borderRadius: "var(--radius-pill)",
      background: "var(--sunken)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: "40%",
      background: "var(--red)",
      borderRadius: "var(--radius-pill)",
      animation: "otIndeterminate 1.4s var(--ease-out) infinite"
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px",
      color: "var(--text-muted)",
      marginTop: "12px",
      lineHeight: 1.6
    }
  }, waitingHint), /*#__PURE__*/React.createElement("style", null, `@keyframes otSpin{to{transform:rotate(360deg)}}@keyframes otIndeterminate{0%{margin-left:-40%}100%{margin-left:100%}}`)), (status === "ready" || status === "stale" || status === "demo") && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "14px"
    }
  }, children));
}
Object.assign(__ds_scope, { AIBriefBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/AIBriefBlock.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* EmptyState — 데이터 없음 + 다음 행동 버튼. (첫 회원 등록 등) */
function EmptyState({
  icon = "inbox",
  title,
  description,
  actionLabel,
  onAction,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "6px",
      padding: "40px 24px",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 52,
      height: 52,
      borderRadius: "var(--radius-pill)",
      background: "var(--sunken)",
      marginBottom: "6px"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 24,
    color: "var(--text-muted)"
  })), title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "16px",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-heading)",
      letterSpacing: "-.03em"
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "13.5px",
      color: "var(--text-sub)",
      maxWidth: "34ch",
      lineHeight: 1.6
    }
  }, description), actionLabel && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    icon: "plus",
    onClick: onAction,
    style: {
      marginTop: "12px"
    }
  }, actionLabel));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Modal — 회원 등록, PT 등록 확정, 예약 액션 등. blocking으로 닫기 불가(필수 공지). */
function Modal({
  open = true,
  title,
  subtitle,
  onClose,
  blocking = false,
  footer,
  children,
  width = 440,
  style,
  ...rest
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 100,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      padding: "0",
      background: "rgba(19,21,27,.44)",
      backdropFilter: "blur(2px)"
    },
    onClick: blocking ? undefined : onClose
  }, /*#__PURE__*/React.createElement("div", _extends({
    role: "dialog",
    "aria-modal": "true",
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: width,
      maxHeight: "92vh",
      overflowY: "auto",
      background: "var(--surface-card)",
      borderRadius: "var(--radius-card-lg) var(--radius-card-lg) 0 0",
      boxShadow: "var(--shadow-pop)",
      animation: "otSheetUp var(--dur-slow) var(--ease-out)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("style", null, `@keyframes otSheetUp{from{transform:translateY(24px);opacity:.6}to{transform:translateY(0);opacity:1}}`), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "12px",
      padding: "20px 20px 14px"
    }
  }, /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "18px",
      fontWeight: "var(--fw-extrabold)",
      letterSpacing: "-.035em",
      color: "var(--text-heading)"
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "13px",
      color: "var(--text-sub)",
      marginTop: "3px"
    }
  }, subtitle)), !blocking && onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "\uB2EB\uAE30",
    size: "sm",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 20px 20px"
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      padding: "14px 20px",
      borderTop: "1px solid var(--border)",
      position: "sticky",
      bottom: 0,
      background: "var(--surface-card)"
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* ProgressBar — 목표 달성률, 오운완 포상 진행률. 레드 채움(진행·달성 표시).
 * 레드 채움은 '누르는 곳/진행'에만 허용된다. */
function ProgressBar({
  value = 0,
  max = 100,
  label,
  valueLabel,
  style,
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "7px",
      ...style
    }
  }, rest), (label || valueLabel) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline"
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "13px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-sub)"
    }
  }, label), valueLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "13px",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-body)",
      fontVariantNumeric: "tabular-nums"
    }
  }, valueLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: "var(--radius-pill)",
      background: "var(--sunken)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: "100%",
      background: "var(--accent)",
      borderRadius: "var(--radius-pill)",
      transition: "width var(--dur-slow) var(--ease-out)"
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Toast — 저장 성공/실패 알림. 쓰기 실패는 조용히 넘기지 않고 반드시 표시한다. */
const TONES = {
  success: {
    icon: "check-circle-2",
    color: "var(--success-text)"
  },
  error: {
    icon: "alert-circle",
    color: "var(--danger-text)"
  },
  info: {
    icon: "info",
    color: "var(--text-sub)"
  }
};
function Toast({
  tone = "success",
  message,
  action,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      maxWidth: 420,
      padding: "12px 16px",
      background: "var(--ink)",
      color: "#fff",
      borderRadius: "var(--radius-control)",
      boxShadow: "var(--shadow-pop)",
      fontSize: "14px",
      fontWeight: "var(--fw-medium)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 18,
    color: tone === "info" ? "#cbd2dd" : t.color
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, message), action);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Checkbox — 개인운동 체크, 동의, 다중 선택. 체크 시 레드 채움. */
function Checkbox({
  checked = false,
  label,
  disabled = false,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "10px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontSize: "14.5px",
      color: "var(--text-body)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      flex: "none",
      borderRadius: "6px",
      background: checked ? "var(--accent)" : "var(--surface-card)",
      boxShadow: checked ? "none" : "inset 0 0 0 2px var(--border-strong)",
      transition: "background var(--dur) var(--ease-out)"
    }
  }, checked && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    color: "var(--text-on-red)"
  })), /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Input — 라벨 + 입력칸. 흰 배경, 10px 라운드, 포커스 시 레드 링. */
function Input({
  label,
  hint,
  error,
  suffix,
  id,
  style,
  containerStyle,
  ...rest
}) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, "-")}` : undefined);
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontSize: "12.5px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-sub)",
      letterSpacing: "-.01em"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      fontFamily: "var(--font-sans)",
      fontSize: "15px",
      fontWeight: "var(--fw-regular)",
      color: "var(--text-body)",
      background: "var(--surface-input)",
      padding: "11px 14px",
      paddingRight: suffix ? "44px" : "14px",
      border: "none",
      borderRadius: "var(--radius-control)",
      boxShadow: `inset 0 0 0 1px ${error ? "var(--danger)" : focus ? "var(--red)" : "var(--border-strong)"}`,
      outline: "none",
      transition: "box-shadow var(--dur) var(--ease-out)",
      ...style
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: "14px",
      fontSize: "13px",
      color: "var(--text-muted)",
      pointerEvents: "none"
    }
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12px",
      color: error ? "var(--danger-text)" : "var(--text-muted)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Select — 헤더 회원 셀렉트, 문진 드롭다운 등. 네이티브 select 래핑. */
function Select({
  label,
  hint,
  id,
  children,
  style,
  containerStyle,
  ...rest
}) {
  const selId = id || (label ? `sel-${label.replace(/\s+/g, "-")}` : undefined);
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: selId,
    style: {
      fontSize: "12.5px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-sub)",
      letterSpacing: "-.01em"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: selId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      appearance: "none",
      WebkitAppearance: "none",
      fontFamily: "var(--font-sans)",
      fontSize: "15px",
      fontWeight: "var(--fw-medium)",
      color: "var(--text-body)",
      background: "var(--surface-input)",
      padding: "11px 40px 11px 14px",
      border: "none",
      borderRadius: "var(--radius-control)",
      boxShadow: `inset 0 0 0 1px ${focus ? "var(--red)" : "var(--border-strong)"}`,
      outline: "none",
      cursor: "pointer",
      transition: "box-shadow var(--dur) var(--ease-out)",
      ...style
    }
  }, rest), children), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18,
    style: {
      position: "absolute",
      right: "13px",
      color: "var(--text-muted)",
      pointerEvents: "none"
    }
  })), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12px",
      color: "var(--text-muted)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Textarea — 음성일지 구조화 결과, 현장 메모, 자유 입력용. */
function Textarea({
  label,
  hint,
  rows = 4,
  id,
  style,
  containerStyle,
  ...rest
}) {
  const taId = id || (label ? `ta-${label.replace(/\s+/g, "-")}` : undefined);
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      ...containerStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: taId,
    style: {
      fontSize: "12.5px",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-sub)",
      letterSpacing: "-.01em"
    }
  }, label), /*#__PURE__*/React.createElement("textarea", _extends({
    id: taId,
    rows: rows,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      resize: "vertical",
      fontFamily: "var(--font-sans)",
      fontSize: "15px",
      lineHeight: 1.6,
      color: "var(--text-body)",
      background: "var(--surface-input)",
      padding: "11px 14px",
      border: "none",
      borderRadius: "var(--radius-control)",
      boxShadow: `inset 0 0 0 1px ${focus ? "var(--red)" : "var(--border-strong)"}`,
      outline: "none",
      transition: "box-shadow var(--dur) var(--ease-out)",
      ...style
    }
  }, rest)), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "12px",
      color: "var(--text-muted)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* BottomNav — 항상 고정 4탭: 오늘 · 회원 · 내 실적 · 설정.
 * 활성 탭은 레드. 워크플로우 탭은 여기 나오지 않는다(상단 서브탭). */
const DEFAULT_ITEMS = [{
  key: "today",
  label: "오늘",
  icon: "sun"
}, {
  key: "members",
  label: "회원",
  icon: "users"
}, {
  key: "stats",
  label: "내 실적",
  icon: "bar-chart-3"
}, {
  key: "settings",
  label: "설정",
  icon: "settings"
}];
function BottomNav({
  items = DEFAULT_ITEMS,
  active,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      display: "flex",
      alignItems: "stretch",
      background: "var(--surface-card)",
      borderTop: "1px solid var(--border)",
      paddingBottom: "env(safe-area-inset-bottom)",
      ...style
    }
  }, rest), items.map(it => {
    const on = it.key === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.key,
      type: "button",
      "aria-current": on ? "page" : undefined,
      onClick: () => onChange && onChange(it.key),
      style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        padding: "9px 0 8px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: on ? "var(--red)" : "var(--text-muted)",
        WebkitTapHighlightColor: "transparent",
        transition: "color var(--dur) var(--ease-out)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 22
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "11px",
        fontWeight: on ? "var(--fw-bold)" : "var(--fw-medium)",
        letterSpacing: "-.01em"
      }
    }, it.label));
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/WorkflowTabBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* WorkflowTabBar — 상단 서브탭 바. 회원 상태에 따라 내용이 갈린다.
 * group: ot(amber) | pt(sky). 밑줄 인디케이터에 그룹 색을 쓴다. */
const GROUPS = {
  ot: {
    color: "var(--ot)",
    tabs: [{
      key: "ot1-prep",
      label: "1차 OT 준비"
    }, {
      key: "ot1-feedback",
      label: "1차 피드백"
    }, {
      key: "ot2-prep",
      label: "2차 OT 준비"
    }]
  },
  pt: {
    color: "var(--pt)",
    tabs: [{
      key: "pt-data",
      label: "회원자료"
    }, {
      key: "pt-log",
      label: "자료남기기"
    }, {
      key: "pt-renew",
      label: "재등록 준비"
    }]
  }
};
function WorkflowTabBar({
  group = "ot",
  tabs,
  active,
  onChange,
  style,
  ...rest
}) {
  const g = GROUPS[group] || GROUPS.ot;
  const list = tabs || g.tabs;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border)",
      ...style
    }
  }, rest), list.map(t => {
    const on = t.key === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      type: "button",
      onClick: () => onChange && onChange(t.key),
      style: {
        flex: 1,
        padding: "13px 6px 11px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: "13.5px",
        fontWeight: on ? "var(--fw-bold)" : "var(--fw-medium)",
        letterSpacing: "-.02em",
        color: on ? "var(--text-heading)" : "var(--text-muted)",
        borderBottom: `2px solid ${on ? g.color : "transparent"}`,
        marginBottom: "-1px",
        transition: "color var(--dur) var(--ease-out), border-color var(--dur) var(--ease-out)",
        WebkitTapHighlightColor: "transparent"
      }
    }, t.label);
  }));
}
Object.assign(__ds_scope, { WorkflowTabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/WorkflowTabBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin/AdminApp.jsx
try { (() => {
const DS = window.DesignSystem_ac3846;
const {
  Icon,
  Button,
  Card,
  Badge,
  StatCard
} = DS;
const TRAINERS = [["박준영", "3,240,000", "42", "확정"], ["김하늘", "2,880,000", "38", "예상"], ["이서준", "2,120,000", "29", "예상"]];
function AdminApp() {
  const [tab, setTab] = React.useState("perf");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100%",
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "14px 24px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-symbol.svg",
    width: "26",
    height: "26",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: "-.04em",
      color: "var(--ink)"
    }
  }, "\uC624\uC9C1 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--red)"
    }
  }, "\uD2B8\uB808\uC774\uB108")), /*#__PURE__*/React.createElement(Badge, {
    tone: "admin",
    style: {
      marginLeft: 2
    }
  }, "\uAD00\uB9AC\uC790"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-sub)"
    }
  }, "\uAC15\uB0A8 1\uD638\uC810 \xB7 \uC6D0\uC7A5")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      padding: "0 24px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border)"
    }
  }, [["perf", "실적"], ["qc", "QC"], ["pay", "급여"], ["ops", "운영"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      padding: "12px 4px",
      marginRight: 18,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: tab === k ? 700 : 500,
      color: tab === k ? "var(--ink)" : "var(--text-muted)",
      borderBottom: `2px solid ${tab === k ? "var(--admin)" : "transparent"}`,
      marginBottom: -1
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 900,
      margin: "0 auto",
      padding: "28px 24px"
    }
  }, tab === "perf" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: "-.04em",
      margin: "0 0 4px"
    }
  }, "\uC774\uB2EC \uC2E4\uC801"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      margin: "0 0 22px"
    }
  }, "2026\uB144 7\uC6D4 \xB7 \uAC15\uB0A8 1\uD638\uC810"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 14,
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC774\uB2EC \uB9E4\uCD9C",
    value: "42,600,000",
    unit: "\uC6D0",
    emphasis: "hero",
    icon: "trending-up"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uD074\uB85C\uC9D5\uB960",
    value: "58",
    unit: "%",
    delta: "+7",
    deltaTone: "up",
    icon: "target"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC7AC\uB4F1\uB85D\uB960",
    value: "71",
    unit: "%",
    delta: "+3",
    deltaTone: "up",
    icon: "repeat"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 11
    }
  }, "\uD2B8\uB808\uC774\uB108\uBCC4 \uC2E4\uC801"), /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr",
      padding: "11px 18px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".1em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\uD2B8\uB808\uC774\uB108"), /*#__PURE__*/React.createElement("span", null, "\uC774\uB2EC \uAE09\uC5EC"), /*#__PURE__*/React.createElement("span", null, "\uC218\uC5C5"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, "\uC0C1\uD0DC")), TRAINERS.map(([n, p, c, s], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr",
      padding: "14px 18px",
      alignItems: "center",
      borderTop: i ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: "var(--ink)",
      fontVariantNumeric: "tabular-nums"
    }
  }, p, "\uC6D0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: "var(--text-sub)",
      fontVariantNumeric: "tabular-nums"
    }
  }, c, "\uD68C"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: s === "확정" ? "success" : "neutral"
  }, s)))))), tab === "qc" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: "-.04em",
      margin: 0
    }
  }, "\uC138\uC77C\uC988 QC"), /*#__PURE__*/React.createElement(Badge, {
    tone: "ot"
  }, "\uB370\uBAA8 \uB370\uC774\uD130")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      margin: "0 0 22px",
      lineHeight: 1.6,
      maxWidth: "56ch"
    }
  }, "\uD589\uB3D9 \uACC4\uCE21\uC774 \uC544\uC9C1 \uC5C6\uC5B4 \uC774 \uC139\uC158\uC740 \uD558\uB4DC\uCF54\uB529\uB41C \uB370\uBAA8\uC785\uB2C8\uB2E4. \uC2E4\uCE21\uC73C\uB85C \uC624\uC778\uD558\uC9C0 \uC54A\uB3C4\uB85D \uBC30\uC9C0\uB97C \uBA85\uC2DC\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement(Card, null, [["박준영", 82], ["김하늘", 74], ["이서준", 61]].map(([n, v], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "10px 0",
      borderTop: i ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 70,
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 8,
      background: "var(--sunken)",
      borderRadius: 999,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${v}%`,
      height: "100%",
      background: "var(--admin)",
      borderRadius: 999
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      textAlign: "right",
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-sub)"
    }
  }, v, "\uC810"))))), tab === "pay" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: "-.04em",
      margin: "0 0 22px"
    }
  }, "\uAE09\uC5EC \uCCB4\uACC4"), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: "var(--text-sub)",
      margin: 0,
      lineHeight: 1.6
    }
  }, "\uD2B8\uB808\uC774\uB108\uBCC4 \uAE30\uBCF8\uAE09\xB7\uC778\uC13C\uD2F0\uBE0C \uAD6C\uAC04\uC744 \uC815\uC758\uD569\uB2C8\uB2E4. \uD655\uC815 \uC2DC \uC2A4\uD0B4 \uC2A4\uB0C5\uC0F7\uC744 \uBCF4\uC874\uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement(Button, {
    style: {
      marginTop: 16
    },
    icon: "settings"
  }, "\uAE09\uC5EC \uC124\uC815 \uC5F4\uAE30"))), tab === "ops" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: "-.04em",
      margin: "0 0 22px"
    }
  }, "\uC6B4\uC601"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user-plus",
    size: 20,
    color: "var(--admin)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700
    }
  }, "\uD2B8\uB808\uC774\uB108 \uCD08\uB300")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: "var(--text-sub)",
      margin: "0 0 14px",
      lineHeight: 1.5
    }
  }, "\uACC4\uC815 \uC0DD\uC131 \u2192 \uCD08\uAE30 \uBE44\uBC00\uBC88\uD638 \uBC1C\uAE09"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uCD08\uB300\uD558\uAE30")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "megaphone",
    size: 20,
    color: "var(--admin)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700
    }
  }, "\uACF5\uC9C0")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: "var(--text-sub)",
      margin: "0 0 14px",
      lineHeight: 1.5
    }
  }, "\uD544\uC218 \uACF5\uC9C0\uB294 \uC571\uC744 \uCC28\uB2E8\uD558\uB294 \uBAA8\uB2EC\uB85C \uD45C\uC2DC"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uACF5\uC9C0 \uC791\uC131"))))));
}
window.AdminApp = AdminApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin/AdminApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/member/MemberApp.jsx
try { (() => {
const DS = window.DesignSystem_ac3846;
const {
  Icon,
  Button,
  Card,
  Badge,
  ProgressBar
} = DS;
const BADGES = [{
  icon: "flame",
  label: "첫 오운완",
  got: true
}, {
  icon: "zap",
  label: "불꽃 7일",
  got: true
}, {
  icon: "check-check",
  label: "꾸준 10회",
  got: true
}, {
  icon: "shield",
  label: "든든 30회",
  got: false
}, {
  icon: "award",
  label: "골드 60회",
  got: false
}];

// 운동 달력 — 3색 점 (PT / 개인운동 / 유산소)
const CAL = {
  3: ["pt"],
  5: ["own"],
  8: ["pt", "cardio"],
  9: ["cardio"],
  12: ["pt"],
  15: ["own", "cardio"],
  16: ["pt"],
  19: ["cardio"],
  21: ["pt", "own"]
};
const DOT = {
  pt: "var(--pt)",
  own: "var(--red)",
  cardio: "var(--ot)"
};
function Login({
  onDone
}) {
  const [d, setD] = React.useState(["", "", "", ""]);
  const refs = [React.useRef(), React.useRef(), React.useRef(), React.useRef()];
  const set = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...d];
    next[i] = v;
    setD(next);
    if (v && i < 3) refs[i + 1].current.focus();
    if (next.every(x => x)) setTimeout(onDone, 350);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 26,
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-symbol.svg",
    width: "52",
    height: "52",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: "-.04em",
      color: "var(--ink)"
    }
  }, "\uBC15\uC11C\uC5F0\uB2D8, \uC548\uB155\uD558\uC138\uC694"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      marginTop: 5
    }
  }, "\uD734\uB300\uD3F0 \uB4A4 4\uC790\uB9AC\uB97C \uC785\uB825\uD558\uC138\uC694")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12
    }
  }, d.map((v, i) => /*#__PURE__*/React.createElement("input", {
    key: i,
    ref: refs[i],
    value: v,
    inputMode: "numeric",
    maxLength: 1,
    onChange: e => set(i, e.target.value),
    style: {
      width: 54,
      height: 62,
      textAlign: "center",
      fontSize: 26,
      fontWeight: 700,
      color: "var(--ink)",
      background: "var(--surface-card)",
      border: "none",
      borderRadius: "var(--radius-control)",
      boxShadow: `inset 0 0 0 1px ${v ? "var(--red)" : "var(--border-strong)"}`,
      outline: "none",
      fontVariantNumeric: "tabular-nums"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      textAlign: "center",
      maxWidth: "28ch",
      lineHeight: 1.5
    }
  }, "\uB9C1\uD06C\uB9CC\uC73C\uB85C\uB294 \uC5F4\uB9AC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD2B8\uB808\uC774\uB108\uAC00 \uB9C1\uD06C\uB97C \uBB34\uD6A8\uD654\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."));
}
function OwnwanCard() {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 44,
      height: 44,
      borderRadius: "var(--radius-pill)",
      background: "var(--red-soft)",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "flame",
    size: 22,
    color: "var(--red)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 800,
      letterSpacing: "-.03em",
      color: "var(--ink)"
    }
  }, "\uC624\uB298 \uC624\uC6B4\uC644 \uC644\uB8CC"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-sub)"
    }
  }, "\uC2E4\uC81C \uAE30\uB85D\uC5D0\uC11C \uD30C\uC0DD\uB429\uB2C8\uB2E4"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      textAlign: "center"
    }
  }, [["이번 달", "18"], ["누적", "142"], ["연속", "23"]].map(([l, v], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      borderLeft: i ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 800,
      color: i === 2 ? "var(--red-strong)" : "var(--ink)",
      fontVariantNumeric: "tabular-nums"
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--text-muted)"
    }
  }, l, i === 2 ? "일" : "회")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 6,
      marginTop: 18
    }
  }, BADGES.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 5,
      opacity: b.got ? 1 : 0.34
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 40,
      height: 40,
      borderRadius: "var(--radius-pill)",
      background: b.got ? "var(--ink)" : "var(--sunken)",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: b.icon,
    size: 19,
    color: b.got ? "#fff" : "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: "var(--text-muted)",
      textAlign: "center",
      lineHeight: 1.2
    }
  }, b.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    label: "\uD2B8\uB808\uC774\uB108 \uD3EC\uC0C1 \xB7 \uB4E0\uB4E0 30\uD68C\uAE4C\uC9C0",
    value: 18,
    max: 30,
    valueLabel: "18 / 30"
  })));
}
function Calendar() {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const cells = [];
  for (let i = 0; i < 2; i++) cells.push(null);
  for (let d = 1; d <= 31; d++) cells.push(d);
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      fontWeight: 700,
      color: "var(--ink)"
    }
  }, "2026\uB144 7\uC6D4"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      fontSize: 11
    }
  }, [["PT", "pt"], ["개인", "own"], ["유산소", "cardio"]].map(([l, k]) => /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 4,
      background: DOT[k]
    }
  }), l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(7,1fr)",
      gap: 2,
      textAlign: "center"
    }
  }, days.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: "var(--text-muted)",
      padding: "2px 0"
    }
  }, d)), cells.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      aspectRatio: "1",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12.5,
      color: c ? "var(--ink)" : "transparent"
    }
  }, c || ".", /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      gap: 2,
      height: 5,
      marginTop: 2
    }
  }, (CAL[c] || []).map((k, j) => /*#__PURE__*/React.createElement("i", {
    key: j,
    style: {
      width: 5,
      height: 5,
      borderRadius: 3,
      background: DOT[k]
    }
  })))))));
}
function Logs() {
  return /*#__PURE__*/React.createElement(Card, {
    padding: "0",
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 16px 4px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".13em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, "\uB0B4 \uC218\uC5C5\uC77C\uC9C0"), [["24회차", "7월 19일", "하체 · 힙힌지 각도 개선. 무릎 통증 없이 스쿼트 12kg."], ["23회차", "7월 16일", "상체 · 랫풀다운 자세 교정. 어깨 가동범위 늘어남."]].map(([r, d, s], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: "13px 16px",
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "pt"
  }, r), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, d)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      lineHeight: 1.55
    }
  }, s))));
}
function Inbody() {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".13em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 12
    }
  }, "\uC778\uBC14\uB514 \uBCC0\uD654"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, [["골격근량", "28.4", "kg", "+1.2", "up"], ["체지방률", "22.1", "%", "-3.4", "down"], ["체중", "61.8", "kg", "-2.1", "down"]].map(([l, v, u, d, t], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      background: "var(--surface-sunken)",
      borderRadius: 11,
      padding: "12px 13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)",
      marginBottom: 5
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: "var(--ink)",
      fontVariantNumeric: "tabular-nums"
    }
  }, v, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: "var(--text-sub)"
    }
  }, " ", u)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 700,
      color: t === "down" ? "var(--success-text)" : "var(--pt-text)",
      marginTop: 3
    }
  }, d)))));
}
function MemberApp() {
  const [logged, setLogged] = React.useState(false);
  const [tab, setTab] = React.useState("record");
  if (!logged) return /*#__PURE__*/React.createElement(Login, {
    onDone: () => setLogged(true)
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "13px 16px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-symbol.svg",
    width: "24",
    height: "24",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15.5,
      fontWeight: 800,
      letterSpacing: "-.04em",
      color: "var(--ink)"
    }
  }, "\uB0B4 \uAE30\uB85D"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--text-sub)"
    }
  }, "\uBC15\uC11C\uC5F0")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      padding: "10px 16px 0",
      gap: 8,
      background: "var(--surface-card)"
    }
  }, [["record", "내 기록"], ["add", "기록 남기기"]].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setTab(k),
    style: {
      padding: "8px 14px 11px",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: tab === k ? 700 : 500,
      color: tab === k ? "var(--ink)" : "var(--text-muted)",
      borderBottom: `2px solid ${tab === k ? "var(--red)" : "transparent"}`,
      marginBottom: -1
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "18px 16px"
    }
  }, tab === "record" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(OwnwanCard, null), /*#__PURE__*/React.createElement(Calendar, null), /*#__PURE__*/React.createElement(Logs, null), /*#__PURE__*/React.createElement(Inbody, null)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dumbbell",
    size: 20,
    color: "var(--red)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "\uAC1C\uC778\uC6B4\uB3D9"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, "\uB0A0\uC9DC + \uC6B4\uB3D9\uB0B4\uC6A9")), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "\uAE30\uB85D"))), /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "footprints",
    size: 20,
    color: "var(--ot)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "\uC720\uC0B0\uC18C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, "\uBD84 \xB7 \uC885\uB958 \xB7 \uBA54\uBAA8")), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "\uAE30\uB85D"))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "camera",
    size: 20,
    color: "var(--pt)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "\uC0AC\uC9C4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, "\uBE44\uD3EC / \uC9C4\uD589 / \uC560\uD504\uD130")), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "\uC5C5\uB85C\uB4DC"))))));
}
window.MemberApp = MemberApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/member/MemberApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/trainer/TrainerApp.jsx
try { (() => {
const DS = window.DesignSystem_ac3846;
const {
  Icon,
  Button,
  IconButton,
  Card,
  Badge,
  Chip,
  Input,
  Textarea,
  Select,
  Checkbox,
  ProgressBar,
  Modal,
  Toast,
  EmptyState,
  AIBriefBlock,
  BottomNav,
  WorkflowTabBar,
  StatCard,
  MemberCard,
  TodoItem
} = DS;
const MEMBERS = [{
  id: "kim",
  name: "김지훈",
  status: "ot",
  summary: "1차 완료 · 재접근 도래",
  meta: "2일 전",
  goal: "체중 감량 · 무릎 불편",
  type: "OT 유입"
}, {
  id: "park",
  name: "박서연",
  status: "pt",
  summary: "잔여 8회 · 재등록 임박",
  meta: "어제",
  goal: "체형 교정 · 근력",
  type: "OT 유입"
}, {
  id: "choi",
  name: "최유진",
  status: "pt",
  summary: "잔여 2회 · 재등록 도래",
  meta: "3일 전",
  goal: "바디프로필 준비",
  type: "인계"
}, {
  id: "lee",
  name: "이도현",
  status: "inactive",
  summary: "환불 종결",
  meta: "2주 전",
  goal: "—",
  type: "외부"
}];
function Section({
  title,
  right,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, title), right), children);
}
function Header({
  member,
  onSelect,
  onNew
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 16px",
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 20
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-symbol.svg",
    width: "26",
    height: "26",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      letterSpacing: "-.05em",
      color: "var(--ink)"
    }
  }, "\uC624\uC9C1 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--red)"
    }
  }, "\uD2B8\uB808\uC774\uB108")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    label: "\uACF5\uC9C0",
    size: "sm"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "user-plus",
    label: "\uC2E0\uADDC \uB4F1\uB85D",
    size: "sm",
    variant: "primary",
    onClick: onNew
  }));
}
function TodayScreen({
  onGo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: "-.045em",
      margin: "0 0 4px"
    }
  }, "\uC624\uB298"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      margin: "0 0 22px"
    }
  }, "2026\uB144 7\uC6D4 21\uC77C \uD654\uC694\uC77C \xB7 \uC624\uB298 \uC218\uC5C5 5\uAC74"), /*#__PURE__*/React.createElement(Section, {
    title: "\uC624\uB298 \uD560 \uC77C \xB7 \uC790\uB3D9 \uAC10\uC9C0"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TodoItem, {
    kind: "unclosed",
    title: "\uBBF8\uD655\uC815 \uD074\uB85C\uC9D5",
    detail: "\uBC15\uC11C\uC5F0 \xB7 2\uCC28 \uC9C4\uD589\uB428, \uACB0\uACFC \uBBF8\uAE30\uB85D",
    onClick: () => onGo("park")
  }), /*#__PURE__*/React.createElement(TodoItem, {
    kind: "reapproach",
    title: "\uC624\uB298 \uC7AC\uC811\uADFC",
    detail: "\uAE40\uC9C0\uD6C8 \xB7 1\uCC28 \uBCF4\uB958 3\uC77C\uCC28",
    onClick: () => onGo("kim")
  }), /*#__PURE__*/React.createElement(TodoItem, {
    kind: "renewal",
    title: "\uC7AC\uB4F1\uB85D \uB3C4\uB798",
    detail: "\uCD5C\uC720\uC9C4 \xB7 \uC794\uC5EC 2\uD68C",
    onClick: () => onGo("choi")
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "\uC774\uD0C8 \uC704\uD5D8"
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "14px 16px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 34,
      height: 34,
      borderRadius: 9,
      background: "var(--ot-soft)",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert-triangle",
    size: 17,
    color: "var(--ot-text)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, "\uC815\uBBFC\uC7AC \xB7 \uB9C8\uC9C0\uB9C9 \uC218\uC5C5 14\uC77C \uC804"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, "\uC218\uC5C5 \uACF5\uBC31 \uAE30\uC900 \uCD08\uACFC")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "\uC5F0\uB77D")))), /*#__PURE__*/React.createElement(Section, {
    title: "\uC624\uB298 \uC608\uC57D"
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, [["07:00", "박서연", "PT", "pt"], ["10:30", "김지훈", "1차 OT", "ot"], ["18:00", "최유진", "PT", "pt"]].map(([t, n, k, tone], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 16px",
      borderTop: i ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      fontVariantNumeric: "tabular-nums",
      color: "var(--ink)",
      width: 46
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14.5,
      color: "var(--ink)"
    }
  }, n), /*#__PURE__*/React.createElement(Badge, {
    tone: tone
  }, k))))));
}
function MembersScreen({
  onSelect
}) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const list = MEMBERS.filter(m => (filter === "all" || m.status === filter) && m.name.includes(q));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: "-.045em",
      margin: "0 0 16px"
    }
  }, "\uD68C\uC6D0"), /*#__PURE__*/React.createElement(Input, {
    placeholder: "\uD68C\uC6D0 \uAC80\uC0C9",
    value: q,
    onChange: e => setQ(e.target.value),
    containerStyle: {
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, [["all", "전체"], ["ot", "OT"], ["pt", "PT"], ["inactive", "종결"]].map(([k, l]) => /*#__PURE__*/React.createElement(Chip, {
    key: k,
    selected: filter === k,
    onClick: () => setFilter(k)
  }, l))), list.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, list.map(m => /*#__PURE__*/React.createElement(MemberCard, {
    key: m.id,
    name: m.name,
    status: m.status,
    summary: m.summary,
    meta: m.meta,
    onClick: () => onSelect(m.id)
  }))) : /*#__PURE__*/React.createElement(EmptyState, {
    icon: "search",
    title: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694",
    description: "\uB2E4\uB978 \uC774\uB984\uC774\uB098 \uD544\uD130\uB85C \uB2E4\uC2DC \uCC3E\uC544\uBCF4\uC138\uC694."
  }));
}
function OTWorkflow({
  member,
  onBack
}) {
  const [tab, setTab] = React.useState("ot1-prep");
  const [briefState, setBriefState] = React.useState("idle");
  const generate = () => {
    setBriefState("loading");
    setTimeout(() => setBriefState("ready"), 2600);
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 16px 0"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "arrow-left",
    label: "\uB4A4\uB85C",
    size: "sm",
    onClick: onBack
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      letterSpacing: "-.035em"
    }
  }, member.name), /*#__PURE__*/React.createElement(Badge, {
    tone: "ot"
  }, "OT \uC9C4\uD589")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px 0"
    }
  }, /*#__PURE__*/React.createElement(WorkflowTabBar, {
    group: "ot",
    active: tab,
    onChange: setTab,
    style: {
      borderRadius: 12,
      border: "1px solid var(--border)",
      overflow: "hidden"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px"
    }
  }, tab === "ot1-prep" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    padding: "15px 17px",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".13em",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      marginBottom: 8
    }
  }, "\uD68C\uC6D0 \uAE30\uBCF8\uC815\uBCF4"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      color: "var(--ink)",
      lineHeight: 1.6
    }
  }, member.goal, /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-sub)",
      fontSize: 13
    }
  }, member.type, " \xB7 \uC885\uC774 \uBB38\uC9C4 17\uD544\uB4DC \uC785\uB825 \uC644\uB8CC"))), /*#__PURE__*/React.createElement(AIBriefBlock, {
    status: briefState,
    title: "1\uCC28 \uC0AC\uC804\uBB34\uC7A5",
    onGenerate: generate,
    onRegenerate: generate,
    waitingHint: "\uC57D 45\uCD08 \uAC78\uB9BD\uB2C8\uB2E4. \uB4E4\uC5B4\uAC00\uAE30 \uC804\uC5D0 \uBB38\uC9C4\uD45C\uB97C \uB2E4\uC2DC \uD6D1\uC5B4\uBCF4\uC138\uC694."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.65,
      color: "var(--text-sub)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "\uC624\uD504\uB2DD"), " \u2014 \"\uBB34\uB98E \uC598\uAE30\uBD80\uD130 \uC5EC\uCB64\uBCFC\uAC8C\uC694. \uC5B8\uC81C\uBD80\uD130 \uBD88\uD3B8\uD558\uC168\uC5B4\uC694?\""), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "\uD0C0\uAE43 \uC885\uBAA9"), " \u2014 \uACE0\uBE14\uB9BF \uC2A4\uCFFC\uD2B8 \xB7 \uD799\uD78C\uC9C0 (\uD1B5\uC99D \uD68C\uD53C \uAC01\uB3C4)"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "\uAC70\uC808 \uBC29\uC5B4 \xB7 \uAC00\uACA9"), " \u2014 \"\uC9C0\uAE08 \uB4F1\uB85D\uC774 \uC544\uB2C8\uB77C, \uC624\uB298 \uBAB8 \uC0C1\uD0DC\uBD80\uD130 \uC815\uD655\uD788 \uBCFC\uAC8C\uC694.\""))), /*#__PURE__*/React.createElement(Textarea, {
    label: "\uD604\uC7A5 \uBA54\uBAA8",
    rows: 3,
    placeholder: "\uC218\uC5C5 \uC911 \uAD00\uCC30\uD55C \uAC83\uC744 \uC989\uC2DC \uAE30\uC785",
    containerStyle: {
      marginTop: 16
    }
  })), tab === "ot1-feedback" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      margin: "0 0 16px",
      lineHeight: 1.6
    }
  }, "1\uCC28\uC5D0\uC11C \uAD00\uCC30\uD55C \uAC83\uC744 \uB370\uC774\uD130\uB85C \uB0A8\uAE41\uB2C8\uB2E4. ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "2\uCC28 AI\uC758 \uC720\uC77C\uD55C \uADFC\uAC70"), "\uC785\uB2C8\uB2E4."), ["관찰 기록", "반응·성향", "진짜 목적", "종합 소견"].map((b, i) => /*#__PURE__*/React.createElement(Textarea, {
    key: i,
    label: `${["①", "②", "③", "④"][i]} ${b}`,
    rows: 2,
    containerStyle: {
      marginBottom: 12
    }
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "15px 17px",
    selected: true,
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--red-strong)",
      marginBottom: 10
    }
  }, "\u3260 1\uCC28 \uD074\uB85C\uC9D5 \uACB0\uACFC"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uC131\uACF5"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary"
  }, "\uBCF4\uB958"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uC2E4\uD328"))), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    style: {
      marginTop: 16
    },
    icon: "save"
  }, "\uAD00\uCC30 \uC800\uC7A5")), tab === "ot2-prep" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(AIBriefBlock, {
    status: "stale",
    title: "2\uCC28 \uB4F1\uB85D \uB2F9\uC704\uC131 \uBE0C\uB9AC\uD551",
    onRegenerate: () => {},
    waitingHint: "\uC57D 45\uCD08 \uAC78\uB9BD\uB2C8\uB2E4."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      lineHeight: 1.65,
      color: "var(--text-sub)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "\uC9C0\uAE08\uC778 \uC774\uC720"), " \u2014 1\uCC28\uC5D0\uC11C \uD799\uD78C\uC9C0 \uAC01\uB3C4\uAC00 \uAC1C\uC120\uB410\uC2B5\uB2C8\uB2E4. \uADFC\uAC70\uAC00 \uC0DD\uACBC\uC744 \uB54C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4."), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--ink)"
    }
  }, "\uC81C\uC548 \uD328\uD0A4\uC9C0"), " \u2014 \uC8FC 2\uD68C \xB7 20\uD68C (\uAC00\uACA9\uC740 \uAC00\uACA9\uD45C\uC5D0\uC11C \uC870\uD68C)"))), /*#__PURE__*/React.createElement(Card, {
    padding: "15px 17px",
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--ink)",
      marginBottom: 10
    }
  }, "\u3260 2\uCC28 \uD074\uB85C\uC9D5 \uACB0\uACFC"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary"
  }, "\uC131\uACF5"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uBCF4\uB958"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "\uC2E4\uD328")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: "var(--text-muted)",
      margin: "12px 0 0",
      lineHeight: 1.5
    }
  }, "\uC131\uACF5\uC744 \uB20C\uB7EC\uB3C4 \uC790\uB3D9 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uACC4\uC57D \uAE08\uC561\uC744 \uB123\uACE0 \uD655\uC815\uD574\uC57C PT\uB85C \uC804\uD658\uB429\uB2C8\uB2E4.")))));
}
function StatsScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: "-.045em",
      margin: "0 0 4px"
    }
  }, "\uB0B4 \uC2E4\uC801"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13.5,
      color: "var(--text-sub)",
      margin: "0 0 22px"
    }
  }, "2026\uB144 7\uC6D4"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC774\uB2EC \uAE09\uC5EC (\uC608\uC0C1)",
    value: "3,240,000",
    unit: "\uC6D0",
    emphasis: "hero",
    icon: "wallet",
    style: {
      gridColumn: "1 / -1"
    }
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uC774\uB2EC \uC218\uC5C5",
    value: "42",
    unit: "\uD68C",
    delta: "+6",
    deltaTone: "up",
    icon: "dumbbell"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "\uD074\uB85C\uC9D5\uB960",
    value: "61",
    unit: "%",
    delta: "-4",
    deltaTone: "down",
    icon: "target"
  })), /*#__PURE__*/React.createElement(Section, {
    title: "\uC774\uB2EC \uBAA9\uD45C"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(ProgressBar, {
    label: "\uC218\uC5C5 50\uD68C \uBAA9\uD45C",
    value: 42,
    max: 50,
    valueLabel: "42 / 50"
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "\uC624\uC6B4\uC644 \uB7AD\uD0B9 \xB7 \uB2F4\uB2F9 \uD68C\uC6D0"
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "0"
  }, [["박서연", "23일", 1], ["최유진", "18일", 2], ["김지훈", "9일", 3]].map(([n, d, r], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      borderTop: i ? "1px solid var(--border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: r === 1 ? "var(--red)" : "var(--text-muted)",
      width: 18
    }
  }, r), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14.5,
      color: "var(--ink)"
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-sub)",
      fontVariantNumeric: "tabular-nums"
    }
  }, "\uC5F0\uC18D ", d))))), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    variant: "secondary",
    icon: "file-text"
  }, "\uC6D4\uAC04 \uB9AC\uD3EC\uD2B8 \uC5F4\uAE30"));
}
function SettingsScreen() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "18px 16px"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: "-.045em",
      margin: "0 0 22px"
    }
  }, "\uC124\uC815"), [["user", "내 정보", "프로필 · 월 목표 · 비밀번호"], ["tag", "정산", "PT 패키지 가격표"], ["dumbbell", "장비/큐", "센터 장비 · AI 큐"], ["book-open", "도서관", "자료 CRUD"], ["gift", "포상", "오운완 누적 포상 정의"]].map(([ic, t, d], i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    interactive: true,
    padding: "14px 16px",
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 34,
      height: 34,
      borderRadius: 9,
      background: "var(--sunken)",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 17,
    color: "var(--text-sub)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      color: "var(--ink)"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, d)), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 18,
    color: "var(--text-muted)"
  })))), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    variant: "secondary",
    icon: "log-out",
    style: {
      marginTop: 8
    }
  }, "\uB85C\uADF8\uC544\uC6C3"));
}
function RegisterModal({
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: "\uC2E0\uADDC \uD68C\uC6D0 \uB4F1\uB85D",
    subtitle: "\uC885\uC774 \uBB38\uC9C4\uD45C\uB97C \uC571\uC73C\uB85C \uC62E\uACA8 \uC801\uC2B5\uB2C8\uB2E4",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: onClose,
      style: {
        flex: 1
      }
    }, "\uCDE8\uC18C"), /*#__PURE__*/React.createElement(Button, {
      style: {
        flex: 2
      },
      onClick: onClose
    }, "\uB4F1\uB85D"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\uC774\uB984",
    placeholder: "\uD68C\uC6D0 \uC774\uB984"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "\uD734\uB300\uD3F0",
    placeholder: "010-0000-0000"
  }), /*#__PURE__*/React.createElement(Select, {
    label: "\uB4F1\uB85D \uC720\uD615"
  }, /*#__PURE__*/React.createElement("option", null, "OT \uC720\uC785"), /*#__PURE__*/React.createElement("option", null, "\uC778\uACC4"), /*#__PURE__*/React.createElement("option", null, "\uC678\uBD80")), /*#__PURE__*/React.createElement(Input, {
    label: "\uBAA9\uD45C",
    placeholder: "\uC608: \uCCB4\uC911 \uAC10\uB7C9 \xB7 \uBB34\uB98E \uBD88\uD3B8"
  })));
}
function TrainerApp() {
  const [tab, setTab] = React.useState("today");
  const [selected, setSelected] = React.useState(null);
  const [modal, setModal] = React.useState(false);
  const [toast, setToast] = React.useState(false);
  const member = MEMBERS.find(m => m.id === selected);
  const openMember = id => {
    setSelected(id);
  };
  const closeMember = () => setSelected(null);
  let body;
  if (member && member.status !== "inactive") body = /*#__PURE__*/React.createElement(OTWorkflow, {
    member: member,
    onBack: closeMember
  });else if (member) body = /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24
    }
  }, /*#__PURE__*/React.createElement(EmptyState, {
    icon: "user-x",
    title: `${member.name} · 종결`,
    description: "\uD658\uBD88\xB7\uC885\uB8CC\uB41C \uD68C\uC6D0\uC785\uB2C8\uB2E4."
  }), /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    variant: "secondary",
    onClick: closeMember
  }, "\uD68C\uC6D0 \uBAA9\uB85D"));else if (tab === "today") body = /*#__PURE__*/React.createElement(TodayScreen, {
    onGo: openMember
  });else if (tab === "members") body = /*#__PURE__*/React.createElement(MembersScreen, {
    onSelect: openMember
  });else if (tab === "stats") body = /*#__PURE__*/React.createElement(StatsScreen, null);else body = /*#__PURE__*/React.createElement(SettingsScreen, null);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement(Header, {
    member: member,
    onNew: () => setModal(true)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, body), /*#__PURE__*/React.createElement(BottomNav, {
    active: tab,
    onChange: k => {
      setSelected(null);
      setTab(k);
    }
  }), modal && /*#__PURE__*/React.createElement(RegisterModal, {
    onClose: () => {
      setModal(false);
      setToast(true);
      setTimeout(() => setToast(false), 2200);
    }
  }), toast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 78,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success",
    message: "\uD68C\uC6D0\uC744 \uB4F1\uB85D\uD588\uC5B4\uC694."
  })));
}
window.TrainerApp = TrainerApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/trainer/TrainerApp.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.MemberCard = __ds_scope.MemberCard;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.TodoItem = __ds_scope.TodoItem;

__ds_ns.AIBriefBlock = __ds_scope.AIBriefBlock;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.WorkflowTabBar = __ds_scope.WorkflowTabBar;

})();
