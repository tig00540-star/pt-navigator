/* @ds-bundle: {"format":4,"namespace":"DesignSystem_2aa111","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"SectionHeader","sourcePath":"components/core/SectionHeader.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"ListRow","sourcePath":"components/display/ListRow.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Button.jsx":"9705dc35bed5","components/core/Card.jsx":"cd282774f353","components/core/IconButton.jsx":"e5df7c114e1d","components/core/SectionHeader.jsx":"4ec1a5ae9d4d","components/display/Badge.jsx":"1977686b8133","components/display/ListRow.jsx":"172c0f309001","components/display/Tag.jsx":"27474bf65f3a","components/forms/Input.jsx":"a4bf788f3348","components/forms/Select.jsx":"70c68ec3638c","components/navigation/BottomNav.jsx":"ae5668205902","components/navigation/Tabs.jsx":"3d6136f71181","ui_kits/only-for-trainer/App.jsx":"dacf2aecceea","ui_kits/only-for-trainer/FirstSupport.jsx":"96558163fee2","ui_kits/only-for-trainer/Header.jsx":"3796fd5e7ef9","ui_kits/only-for-trainer/Observation.jsx":"2e1cac05ae15","ui_kits/only-for-trainer/SecondBriefing.jsx":"d3b82754a99d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_2aa111 = window.DesignSystem_2aa111 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Primary action button. Rounded, generous padding, red brand gradient.
 * `icon`/`iconRight` take a Lucide icon name; call lucide.createIcons() after mount. */
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      fontSize: 'var(--fs-sm)',
      padding: '9px 16px',
      radius: 'var(--radius-sm)',
      gap: '6px',
      icon: 15
    },
    md: {
      fontSize: 'var(--fs-body)',
      padding: 'var(--pad-btn-y) var(--pad-btn-x)',
      radius: 'var(--radius-md)',
      gap: '8px',
      icon: 17
    },
    lg: {
      fontSize: 'var(--fs-h3)',
      padding: '16px 30px',
      radius: 'var(--radius-md)',
      gap: '10px',
      icon: 19
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--brand-gradient)',
      color: 'var(--text-on-brand)',
      border: 'none',
      boxShadow: 'var(--shadow-brand)'
    },
    secondary: {
      background: 'var(--gray-0)',
      color: 'var(--text-strong)',
      border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-xs)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--brand)',
      border: 'none',
      boxShadow: 'none'
    },
    danger: {
      background: 'var(--danger-500)',
      color: '#fff',
      border: 'none',
      boxShadow: 'var(--shadow-brand)'
    }
  };
  const v = variants[variant] || variants.primary;
  const sz = {
    width: s.icon,
    height: s.icon,
    flex: '0 0 auto'
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-bold)',
      fontSize: s.fontSize,
      lineHeight: 1,
      letterSpacing: 'var(--ls-snug)',
      padding: s.padding,
      borderRadius: s.radius,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      width: fullWidth ? '100%' : 'auto',
      whiteSpace: 'nowrap',
      userSelect: 'none',
      transition: 'transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard)',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: sz
  }), children && /*#__PURE__*/React.createElement("span", null, children), iconRight && /*#__PURE__*/React.createElement("i", {
    "data-lucide": iconRight,
    style: sz
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* White rounded surface that holds content. `feature` adds a soft red wash
 * for the primary "AI 지원" style cards. */
function Card({
  feature = false,
  padding,
  interactive = false,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: feature ? 'linear-gradient(180deg,#FFF6F4 0%,var(--gray-0) 60%)' : 'var(--surface-card)',
      border: feature ? '1px solid var(--red-100)' : '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-card)',
      padding: padding || 'var(--pad-card)',
      transition: 'box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base)',
      cursor: interactive ? 'pointer' : 'default',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Circular / pill icon-only button used in the app header (bell, shield, add). */
function IconButton({
  icon,
  size = 'md',
  variant = 'plain',
  active = false,
  ariaLabel,
  style,
  ...rest
}) {
  const sizes = {
    sm: 32,
    md: 40,
    lg: 46
  };
  const dim = sizes[size] || sizes.md;
  const iconPx = Math.round(dim * 0.5);
  const variants = {
    plain: {
      background: 'transparent',
      color: 'var(--text-muted)',
      border: 'none'
    },
    surface: {
      background: 'var(--gray-0)',
      color: 'var(--text-body)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-xs)'
    },
    soft: {
      background: 'var(--brand-soft)',
      color: 'var(--brand)',
      border: 'none'
    },
    secure: {
      background: 'color-mix(in srgb,var(--violet-400) 16%,transparent)',
      color: 'var(--violet-500)',
      border: 'none'
    }
  };
  const v = active ? variants.soft : variants[variant] || variants.plain;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": ariaLabel,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      borderRadius: 'var(--radius-pill)',
      cursor: 'pointer',
      transition: 'background var(--dur-fast) var(--ease-standard), transform var(--dur-fast)',
      ...v,
      ...style
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(0.92)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: iconPx,
      height: iconPx
    }
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/SectionHeader.jsx
try { (() => {
/* Section heading with a leading accent icon, title, and optional subtitle —
 * the "오늘의 클로징 · 수업 전 준비" pattern. Makes features scannable at a glance. */
function SectionHeader({
  icon,
  iconColor = 'var(--brand)',
  title,
  subtitle,
  action,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 18,
      height: 18,
      color: iconColor,
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      flex: 1,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-title)',
      color: 'var(--text-strong)',
      letterSpacing: 'var(--ls-snug)'
    }
  }, title), action), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      marginLeft: icon ? '26px' : 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-normal)'
    }
  }, subtitle));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
/* Filled status badge — the red "실 AI" / "OT" markers. */
function Badge({
  children,
  tone = 'brand',
  variant = 'solid',
  icon,
  style
}) {
  const tones = {
    brand: {
      solid: ['var(--brand)', '#fff'],
      soft: ['var(--brand-soft)', 'var(--brand)'],
      outline: ['transparent', 'var(--brand)']
    },
    neutral: {
      solid: ['var(--gray-700)', '#fff'],
      soft: ['var(--gray-100)', 'var(--gray-600)'],
      outline: ['transparent', 'var(--gray-500)']
    },
    success: {
      solid: ['var(--success-500)', '#fff'],
      soft: ['var(--success-50)', 'var(--success-500)'],
      outline: ['transparent', 'var(--success-500)']
    },
    warning: {
      solid: ['var(--warning-500)', '#fff'],
      soft: ['var(--warning-50)', '#B77807'],
      outline: ['transparent', '#B77807']
    }
  };
  const [bg, fg] = (tones[tone] || tones.brand)[variant] || tones.brand.solid;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      background: bg,
      color: fg,
      border: variant === 'outline' ? `1.5px solid currentColor` : 'none',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-xs)',
      letterSpacing: 'var(--ls-snug)',
      lineHeight: 1,
      padding: '5px 9px',
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 12,
      height: 12
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/ListRow.jsx
try { (() => {
/* Expandable briefing row — the "▶ 자극 잘 옴" list items. A leading play
 * caret rotates when open, a Tag-style label sits inline, content reveals below. */
function ListRow({
  label,
  tagTone = 'neutral',
  open = false,
  onToggle,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-xs)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      width: '100%',
      padding: 'var(--pad-row)',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "play",
    style: {
      width: 13,
      height: 13,
      color: 'var(--brand)',
      fill: 'var(--brand)',
      flex: '0 0 auto',
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform var(--dur-base) var(--ease-standard)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: tagTone === 'brand' ? 'var(--brand-soft)' : 'var(--gray-100)',
      color: tagTone === 'brand' ? 'var(--brand)' : 'var(--text-body)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 'var(--fs-sm)',
      padding: '6px 12px',
      borderRadius: 'var(--radius-pill)'
    }
  }, label)), open && children && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 var(--pad-row) var(--pad-row) 40px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-body)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-relaxed)'
    }
  }, children));
}
Object.assign(__ds_scope, { ListRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/ListRow.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
/* Soft rounded chip/tag — the "자극 잘 옴 / 약하게 옴 / 아직 없음" pills.
 * `selected` promotes it to the brand color. */
function Tag({
  children,
  selected = false,
  icon,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      background: selected ? 'var(--brand-soft)' : 'var(--gray-100)',
      color: selected ? 'var(--brand)' : 'var(--text-muted)',
      border: `1px solid ${selected ? 'var(--red-200)' : 'transparent'}`,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 'var(--fs-sm)',
      letterSpacing: 'var(--ls-snug)',
      lineHeight: 1,
      padding: '7px 13px',
      borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--dur-fast), color var(--dur-fast)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 13,
      height: 13
    }
  }), children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Text input with optional label and leading icon. Rounded to match buttons.
 * Intentional addition — gym/member management needs forms (see readme). */
function Input({
  label,
  icon,
  hint,
  error,
  style,
  wrapStyle,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      fontFamily: 'var(--font-sans)',
      ...wrapStyle
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-body)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'var(--gray-0)',
      border: `1px solid ${error ? 'var(--danger-500)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
      transition: 'border-color var(--dur-fast), box-shadow var(--dur-fast)'
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 17,
      height: 17,
      color: 'var(--text-faint)',
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("input", _extends({
    style: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-body)',
      color: 'var(--text-strong)',
      minWidth: 0,
      ...style
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: error ? 'var(--danger-500)' : 'var(--text-faint)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
/* Compact pill dropdown — the "이해금 ⇅ / 배기태 ⇅" member selector in the header. */
function Select({
  value,
  options = [],
  onChange,
  icon = 'user',
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: 'var(--gray-0)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-pill)',
      padding: '7px 10px 7px 12px',
      boxShadow: 'var(--shadow-xs)',
      cursor: 'pointer',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 15,
      height: 15,
      color: 'var(--text-muted)'
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-strong)',
      cursor: 'pointer',
      paddingRight: '2px'
    }
  }, options.map(o => {
    const val = typeof o === 'string' ? o : o.value;
    const lab = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: val,
      value: val
    }, lab);
  })), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "chevrons-up-down",
    style: {
      width: 14,
      height: 14,
      color: 'var(--text-faint)'
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
/* Bottom tab bar — 오늘 / 회원 / 내 실적 / 설정. Active item turns brand red. */
function BottomNav({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'space-around',
      height: 'var(--tabbar-height)',
      background: 'var(--surface-card)',
      borderTop: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-nav)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, items.map(it => {
    const active = it.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onChange && onChange(it.value),
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--brand)' : 'var(--text-faint)',
        transition: 'color var(--dur-fast)'
      }
    }, /*#__PURE__*/React.createElement("i", {
      "data-lucide": it.icon,
      style: {
        width: 22,
        height: 22,
        strokeWidth: active ? 2.4 : 2
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--fs-xs)',
        fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-medium)'
      }
    }, it.label));
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/* Top text tabs with the orange active underline — "1차 지원 / 관찰 기록 / 2차 브리핑". */
function Tabs({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-6)',
      borderBottom: '1px solid var(--border-subtle)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, items.map(it => {
    const key = typeof it === 'string' ? it : it.value;
    const label = typeof it === 'string' ? it : it.label;
    const active = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      onClick: () => onChange && onChange(key),
      style: {
        position: 'relative',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '12px 2px',
        fontFamily: 'var(--font-sans)',
        fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-medium)',
        fontSize: 'var(--fs-body)',
        letterSpacing: 'var(--ls-snug)',
        color: active ? 'var(--text-strong)' : 'var(--text-faint)',
        transition: 'color var(--dur-base) var(--ease-standard)'
      }
    }, label, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -1,
        height: 3,
        borderRadius: '3px 3px 0 0',
        background: active ? 'var(--accent)' : 'transparent',
        transition: 'background var(--dur-base) var(--ease-standard)'
      }
    }));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/only-for-trainer/App.jsx
try { (() => {
/* App shell — phone frame, status bar, tabs, scroll area, bottom nav. */
const {
  Tabs,
  BottomNav
} = window.DesignSystem_2aa111;
const {
  OFTHeader,
  OFTFirstSupport,
  OFTSecondBriefing,
  OFTObservation
} = window;
const MEMBERS = {
  '이해금': 41,
  '배기태': 33,
  '황대수': 29
};
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 22px 4px',
      background: '#000',
      color: '#fff',
      fontSize: 14,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", null, "7:05"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "signal",
    style: {
      width: 15,
      height: 15
    }
  }), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "wifi",
    style: {
      width: 15,
      height: 15
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      border: '1.5px solid #fff',
      borderRadius: 4,
      padding: '1px 4px',
      fontSize: 10
    }
  }, "33")));
}
function OFTApp() {
  const [tab, setTab] = React.useState('2차 브리핑');
  const [nav, setNav] = React.useState('member');
  const [member, setMember] = React.useState('배기태');
  React.useEffect(() => {
    window.lucide && lucide.createIcons();
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 780,
      background: '#000',
      borderRadius: 44,
      padding: 5,
      boxShadow: 'var(--shadow-lg)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: '100%',
      background: 'var(--bg-app)',
      borderRadius: 39,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(StatusBar, null), /*#__PURE__*/React.createElement(OFTHeader, {
    member: member,
    members: Object.keys(MEMBERS),
    onMember: setMember
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 16px 0',
      background: 'var(--surface-card)'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    items: ['1차 지원', '관찰 기록', '2차 브리핑'],
    value: tab,
    onChange: setTab
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '18px 16px 20px'
    }
  }, tab === '1차 지원' && /*#__PURE__*/React.createElement(OFTFirstSupport, {
    member: member,
    age: MEMBERS[member]
  }), tab === '관찰 기록' && /*#__PURE__*/React.createElement(OFTObservation, null), tab === '2차 브리핑' && /*#__PURE__*/React.createElement(OFTSecondBriefing, null)), /*#__PURE__*/React.createElement(BottomNav, {
    value: nav,
    onChange: setNav,
    items: [{
      value: 'today',
      label: '오늘',
      icon: 'calendar-days'
    }, {
      value: 'member',
      label: '회원',
      icon: 'users'
    }, {
      value: 'stats',
      label: '내 실적',
      icon: 'trophy'
    }, {
      value: 'settings',
      label: '설정',
      icon: 'settings'
    }]
  })));
}
Object.assign(window, {
  OFTApp
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/only-for-trainer/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/only-for-trainer/FirstSupport.jsx
try { (() => {
/* 1차 지원 — AI OT support generator + selected member card. */
const {
  Card,
  SectionHeader,
  Button,
  Badge
} = window.DesignSystem_2aa111;
function OFTFirstSupport({
  member,
  age
}) {
  const [generating, setGenerating] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const gen = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setDone(true);
    }, 900);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    feature: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    icon: "sparkles",
    title: "AI 1\uCC28 OT \uC9C0\uC6D0 (\uAC00\uC124)"
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    icon: "sparkles",
    onClick: gen,
    disabled: generating
  }, generating ? '생성 중…' : 'AI 지원 생성')), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 13,
      color: 'var(--text-muted)',
      lineHeight: 1.6
    }
  }, "\uD68C\uC6D0 \uAE30\uBCF8\uC815\uBCF4 + \uB0B4 \uD328\uD0A4\uC9C0\uB85C 1\uCC28 OT 6\uB2E8\uACC4 \uD750\uB984 \xB7 \uCD94\uCC9C \uD504\uB85C\uADF8\uB7A8 \xB7 \uD074\uB85C\uC9D5 4\uB2E8\uACC4 \xB7 \uAC70\uC808 \uB300\uC751\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4. (\uAD00\uCC30 \uC544\uB2D8 \xB7 \uAC00\uC124)"), done && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: 12,
      background: 'var(--gray-50)',
      borderRadius: 12,
      fontSize: 13,
      color: 'var(--text-body)',
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--brand)'
    }
  }, "\u2460 \uB77C\uD3EC"), " \u2192 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--brand)'
    }
  }, "\u2461 \uCCB4\uD615 \uC9C4\uB2E8"), " \u2192 ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--brand)'
    }
  }, "\u2462 \uBAA9\uD45C \uD569\uC758"), " \u2192 \u2463 \uC2DC\uC5F0 \u2192 \u2464 \uD504\uB85C\uADF8\uB7A8 \uC81C\uC548 \u2192 \u2465 \uD074\uB85C\uC9D5")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    variant: "outline"
  }, "OT"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28,
      fontWeight: 800,
      color: 'var(--text-strong)',
      letterSpacing: '-.02em'
    }
  }, member), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, age, "\uC138")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 14,
      color: 'var(--text-faint)',
      fontWeight: 500
    }
  }, "\uBAA9\uD45C \uBBF8\uC124\uC815")));
}
Object.assign(window, {
  OFTFirstSupport
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/only-for-trainer/FirstSupport.jsx", error: String((e && e.message) || e) }); }

// ui_kits/only-for-trainer/Header.jsx
try { (() => {
/* App header — logo mark, trainer name, member selector, action icons. */
const {
  Select,
  IconButton
} = window.DesignSystem_2aa111;
function OFTHeader({
  member,
  members,
  onMember
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 16px',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-only-for-trainer.png",
    alt: "\uC624\uC9C1 \uD2B8\uB808\uC774\uB108",
    style: {
      width: 38,
      height: 38,
      borderRadius: 11,
      objectFit: 'cover',
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, "\uC624\uC9C1 \uD2B8\uB808\uC774\uB108"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: 'var(--text-strong)',
      letterSpacing: '-.02em'
    }
  }, "\uD669\uB300\uC218"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(Select, {
    icon: "user",
    value: member,
    onChange: onMember,
    options: members,
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "user-plus",
    variant: "surface",
    ariaLabel: "\uD68C\uC6D0 \uCD94\uAC00"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    variant: "surface",
    ariaLabel: "\uC54C\uB9BC"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "shield-check",
    variant: "secure",
    ariaLabel: "\uBCF4\uC548"
  })));
}
Object.assign(window, {
  OFTHeader
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/only-for-trainer/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/only-for-trainer/Observation.jsx
try { (() => {
/* 관찰 기록 — lightweight observation log (session notes timeline). */
const {
  SectionHeader,
  Card,
  Tag
} = window.DesignSystem_2aa111;
function OFTObservation() {
  const logs = [{
    date: '7. 12',
    tags: ['자극 잘 옴', '하체'],
    note: '스쿼트 5x5, 폼 안정. 마지막 세트 자극 강함.'
  }, {
    date: '7. 09',
    tags: ['약하게 옴', '상체'],
    note: '벤치 텐션 부족. 다음 회차 사전 피로 적용 예정.'
  }, {
    date: '7. 05',
    tags: ['OT'],
    note: '첫 OT. 목표 상담 · 체형 진단 완료.'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    icon: "clipboard-list",
    title: "\uAD00\uCC30 \uAE30\uB85D",
    subtitle: "\uC218\uC5C5\uB9C8\uB2E4 \uB0A8\uAE34 \uD68C\uC6D0\uC758 \uBC18\uC751 \uB85C\uADF8"
  }), logs.map((l, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padding: "14px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, l.date), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, l.tags.map((t, j) => /*#__PURE__*/React.createElement(Tag, {
    key: j,
    selected: j === 0
  }, t)))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      color: 'var(--text-body)',
      lineHeight: 1.6
    }
  }, l.note))));
}
Object.assign(window, {
  OFTObservation
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/only-for-trainer/Observation.jsx", error: String((e && e.message) || e) }); }

// ui_kits/only-for-trainer/SecondBriefing.jsx
try { (() => {
/* 2차 브리핑 — AI-generated pre-class closing prep with expandable rows. */
const {
  SectionHeader,
  ListRow,
  Badge,
  Button
} = window.DesignSystem_2aa111;
function BriefBlock({
  icon,
  title,
  subtitle,
  rows
}) {
  const [open, setOpen] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    icon: icon,
    title: title,
    subtitle: subtitle
  }), rows.map((r, i) => /*#__PURE__*/React.createElement(ListRow, {
    key: i,
    label: r.label,
    tagTone: i === 0 ? 'brand' : 'neutral',
    open: open === i,
    onToggle: () => setOpen(open === i ? null : i)
  }, r.body)));
}
function OFTSecondBriefing() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    icon: "sparkles"
  }, "\uC2E4 AI"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, "\uC0DD\uC131: 2026. 7. 12. \uC624\uC804 9:33 \xB7 \uD604\uC7AC \uAD00\uCC30 \uAE30\uC900"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "rotate-cw"
  }, "\uC7AC\uC0DD\uC131")), /*#__PURE__*/React.createElement(BriefBlock, {
    icon: "flame",
    title: "\uC624\uB298\uC758 \uD074\uB85C\uC9D5 \xB7 \uC218\uC5C5 \uC804 \uC900\uBE44",
    rows: [{
      label: '자극 잘 옴',
      body: '다음 세트 강도를 한 단계 올리고, "지금 이 느낌이 목표"라고 언어로 각인시키세요.'
    }, {
      label: '약하게 옴',
      body: '자세부터 점검하고 텐션 위주로 다시 유도합니다. 무게보다 범위.'
    }, {
      label: '아직 없음',
      body: '가동 범위와 호흡을 먼저 잡고, 신경 활성 세트를 1세트 추가하세요.'
    }]
  }), /*#__PURE__*/React.createElement(BriefBlock, {
    icon: "wrench",
    title: "\uC790\uADF9 \uACB0\uACFC\uBCC4 \uC6B4\uB3D9 \uB300\uCC98 \xB7 \uC218\uC5C5 \uC804 \uC900\uBE44",
    subtitle: "\uC138\uC77C\uC988\uAC00 \uC544\uB2C8\uB77C '\uBAB8\uC744 \uC5B4\uB5BB\uAC8C \uC870\uC815\uD558\uB098'. \uC218\uC5C5 \uC804\uC5D0 3\uAC08\uB798\uB97C \uBBF8\uB9AC \uD6D1\uC5B4\uB450\uC138\uC694.",
    rows: [{
      label: '자극 잘 옴',
      body: '동일 패턴 유지, 볼륨만 소폭 증가. 회복 구간을 짧게.'
    }, {
      label: '약하게 옴',
      body: '보조 운동으로 사전 피로를 주고 메인 컴파운드로 재유도.'
    }, {
      label: '아직 없음',
      body: '움직임 교정 우선. 템포를 늦추고 정점 수축을 강조하세요.'
    }]
  }), /*#__PURE__*/React.createElement(ListRow, {
    label: "\uB4F1\uB85D \uB2F9\uC704\uC131 \uBE0C\uB9AC\uD551",
    tagTone: "brand",
    open: false,
    onToggle: () => {}
  }));
}
Object.assign(window, {
  OFTSecondBriefing
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/only-for-trainer/SecondBriefing.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ListRow = __ds_scope.ListRow;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
