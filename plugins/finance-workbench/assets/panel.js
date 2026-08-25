var Df = { exports: {} }, Lu = {};
var Xo;
function T0() {
  if (Xo) return Lu;
  Xo = 1;
  var s = /* @__PURE__ */ Symbol.for("react.transitional.element"), m = /* @__PURE__ */ Symbol.for("react.fragment");
  function _(r, O, C) {
    var R = null;
    if (C !== void 0 && (R = "" + C), O.key !== void 0 && (R = "" + O.key), "key" in O) {
      C = {};
      for (var B in O)
        B !== "key" && (C[B] = O[B]);
    } else C = O;
    return O = C.ref, {
      $$typeof: s,
      type: r,
      key: R,
      ref: O !== void 0 ? O : null,
      props: C
    };
  }
  return Lu.Fragment = m, Lu.jsx = _, Lu.jsxs = _, Lu;
}
var Lo;
function z0() {
  return Lo || (Lo = 1, Df.exports = T0()), Df.exports;
}
var f = z0(), Cf = { exports: {} }, w = {};
var Zo;
function j0() {
  if (Zo) return w;
  Zo = 1;
  var s = /* @__PURE__ */ Symbol.for("react.transitional.element"), m = /* @__PURE__ */ Symbol.for("react.portal"), _ = /* @__PURE__ */ Symbol.for("react.fragment"), r = /* @__PURE__ */ Symbol.for("react.strict_mode"), O = /* @__PURE__ */ Symbol.for("react.profiler"), C = /* @__PURE__ */ Symbol.for("react.consumer"), R = /* @__PURE__ */ Symbol.for("react.context"), B = /* @__PURE__ */ Symbol.for("react.forward_ref"), E = /* @__PURE__ */ Symbol.for("react.suspense"), p = /* @__PURE__ */ Symbol.for("react.memo"), X = /* @__PURE__ */ Symbol.for("react.lazy"), N = /* @__PURE__ */ Symbol.for("react.activity"), U = Symbol.iterator;
  function Y(h) {
    return h === null || typeof h != "object" ? null : (h = U && h[U] || h["@@iterator"], typeof h == "function" ? h : null);
  }
  var cl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, J = Object.assign, kl = {};
  function Hl(h, j, M) {
    this.props = h, this.context = j, this.refs = kl, this.updater = M || cl;
  }
  Hl.prototype.isReactComponent = {}, Hl.prototype.setState = function(h, j) {
    if (typeof h != "object" && typeof h != "function" && h != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, h, j, "setState");
  }, Hl.prototype.forceUpdate = function(h) {
    this.updater.enqueueForceUpdate(this, h, "forceUpdate");
  };
  function tt() {
  }
  tt.prototype = Hl.prototype;
  function xl(h, j, M) {
    this.props = h, this.context = j, this.refs = kl, this.updater = M || cl;
  }
  var Ll = xl.prototype = new tt();
  Ll.constructor = xl, J(Ll, Hl.prototype), Ll.isPureReactComponent = !0;
  var at = Array.isArray;
  function Bl() {
  }
  var k = { H: null, A: null, T: null, S: null }, Ul = Object.prototype.hasOwnProperty;
  function jl(h, j, M) {
    var q = M.ref;
    return {
      $$typeof: s,
      type: h,
      key: j,
      ref: q !== void 0 ? q : null,
      props: M
    };
  }
  function fa(h, j) {
    return jl(h.type, j, h.props);
  }
  function rt(h) {
    return typeof h == "object" && h !== null && h.$$typeof === s;
  }
  function Fl(h) {
    var j = { "=": "=0", ":": "=2" };
    return "$" + h.replace(/[=:]/g, function(M) {
      return j[M];
    });
  }
  var Dt = /\/+/g;
  function bt(h, j) {
    return typeof h == "object" && h !== null && h.key != null ? Fl("" + h.key) : j.toString(36);
  }
  function dt(h) {
    switch (h.status) {
      case "fulfilled":
        return h.value;
      case "rejected":
        throw h.reason;
      default:
        switch (typeof h.status == "string" ? h.then(Bl, Bl) : (h.status = "pending", h.then(
          function(j) {
            h.status === "pending" && (h.status = "fulfilled", h.value = j);
          },
          function(j) {
            h.status === "pending" && (h.status = "rejected", h.reason = j);
          }
        )), h.status) {
          case "fulfilled":
            return h.value;
          case "rejected":
            throw h.reason;
        }
    }
    throw h;
  }
  function x(h, j, M, q, K) {
    var $ = typeof h;
    ($ === "undefined" || $ === "boolean") && (h = null);
    var tl = !1;
    if (h === null) tl = !0;
    else
      switch ($) {
        case "bigint":
        case "string":
        case "number":
          tl = !0;
          break;
        case "object":
          switch (h.$$typeof) {
            case s:
            case m:
              tl = !0;
              break;
            case X:
              return tl = h._init, x(
                tl(h._payload),
                j,
                M,
                q,
                K
              );
          }
      }
    if (tl)
      return K = K(h), tl = q === "" ? "." + bt(h, 0) : q, at(K) ? (M = "", tl != null && (M = tl.replace(Dt, "$&/") + "/"), x(K, j, M, "", function(qa) {
        return qa;
      })) : K != null && (rt(K) && (K = fa(
        K,
        M + (K.key == null || h && h.key === K.key ? "" : ("" + K.key).replace(
          Dt,
          "$&/"
        ) + "/") + tl
      )), j.push(K)), 1;
    tl = 0;
    var Yl = q === "" ? "." : q + ":";
    if (at(h))
      for (var Al = 0; Al < h.length; Al++)
        q = h[Al], $ = Yl + bt(q, Al), tl += x(
          q,
          j,
          M,
          $,
          K
        );
    else if (Al = Y(h), typeof Al == "function")
      for (h = Al.call(h), Al = 0; !(q = h.next()).done; )
        q = q.value, $ = Yl + bt(q, Al++), tl += x(
          q,
          j,
          M,
          $,
          K
        );
    else if ($ === "object") {
      if (typeof h.then == "function")
        return x(
          dt(h),
          j,
          M,
          q,
          K
        );
      throw j = String(h), Error(
        "Objects are not valid as a React child (found: " + (j === "[object Object]" ? "object with keys {" + Object.keys(h).join(", ") + "}" : j) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return tl;
  }
  function D(h, j, M) {
    if (h == null) return h;
    var q = [], K = 0;
    return x(h, q, "", "", function($) {
      return j.call(M, $, K++);
    }), q;
  }
  function V(h) {
    if (h._status === -1) {
      var j = h._result;
      j = j(), j.then(
        function(M) {
          (h._status === 0 || h._status === -1) && (h._status = 1, h._result = M);
        },
        function(M) {
          (h._status === 0 || h._status === -1) && (h._status = 2, h._result = M);
        }
      ), h._status === -1 && (h._status = 0, h._result = j);
    }
    if (h._status === 1) return h._result.default;
    throw h._result;
  }
  var sl = typeof reportError == "function" ? reportError : function(h) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var j = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof h == "object" && h !== null && typeof h.message == "string" ? String(h.message) : String(h),
        error: h
      });
      if (!window.dispatchEvent(j)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", h);
      return;
    }
    console.error(h);
  }, rl = {
    map: D,
    forEach: function(h, j, M) {
      D(
        h,
        function() {
          j.apply(this, arguments);
        },
        M
      );
    },
    count: function(h) {
      var j = 0;
      return D(h, function() {
        j++;
      }), j;
    },
    toArray: function(h) {
      return D(h, function(j) {
        return j;
      }) || [];
    },
    only: function(h) {
      if (!rt(h))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return h;
    }
  };
  return w.Activity = N, w.Children = rl, w.Component = Hl, w.Fragment = _, w.Profiler = O, w.PureComponent = xl, w.StrictMode = r, w.Suspense = E, w.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = k, w.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(h) {
      return k.H.useMemoCache(h);
    }
  }, w.cache = function(h) {
    return function() {
      return h.apply(null, arguments);
    };
  }, w.cacheSignal = function() {
    return null;
  }, w.cloneElement = function(h, j, M) {
    if (h == null)
      throw Error(
        "The argument must be a React element, but you passed " + h + "."
      );
    var q = J({}, h.props), K = h.key;
    if (j != null)
      for ($ in j.key !== void 0 && (K = "" + j.key), j)
        !Ul.call(j, $) || $ === "key" || $ === "__self" || $ === "__source" || $ === "ref" && j.ref === void 0 || (q[$] = j[$]);
    var $ = arguments.length - 2;
    if ($ === 1) q.children = M;
    else if (1 < $) {
      for (var tl = Array($), Yl = 0; Yl < $; Yl++)
        tl[Yl] = arguments[Yl + 2];
      q.children = tl;
    }
    return jl(h.type, K, q);
  }, w.createContext = function(h) {
    return h = {
      $$typeof: R,
      _currentValue: h,
      _currentValue2: h,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, h.Provider = h, h.Consumer = {
      $$typeof: C,
      _context: h
    }, h;
  }, w.createElement = function(h, j, M) {
    var q, K = {}, $ = null;
    if (j != null)
      for (q in j.key !== void 0 && ($ = "" + j.key), j)
        Ul.call(j, q) && q !== "key" && q !== "__self" && q !== "__source" && (K[q] = j[q]);
    var tl = arguments.length - 2;
    if (tl === 1) K.children = M;
    else if (1 < tl) {
      for (var Yl = Array(tl), Al = 0; Al < tl; Al++)
        Yl[Al] = arguments[Al + 2];
      K.children = Yl;
    }
    if (h && h.defaultProps)
      for (q in tl = h.defaultProps, tl)
        K[q] === void 0 && (K[q] = tl[q]);
    return jl(h, $, K);
  }, w.createRef = function() {
    return { current: null };
  }, w.forwardRef = function(h) {
    return { $$typeof: B, render: h };
  }, w.isValidElement = rt, w.lazy = function(h) {
    return {
      $$typeof: X,
      _payload: { _status: -1, _result: h },
      _init: V
    };
  }, w.memo = function(h, j) {
    return {
      $$typeof: p,
      type: h,
      compare: j === void 0 ? null : j
    };
  }, w.startTransition = function(h) {
    var j = k.T, M = {};
    k.T = M;
    try {
      var q = h(), K = k.S;
      K !== null && K(M, q), typeof q == "object" && q !== null && typeof q.then == "function" && q.then(Bl, sl);
    } catch ($) {
      sl($);
    } finally {
      j !== null && M.types !== null && (j.types = M.types), k.T = j;
    }
  }, w.unstable_useCacheRefresh = function() {
    return k.H.useCacheRefresh();
  }, w.use = function(h) {
    return k.H.use(h);
  }, w.useActionState = function(h, j, M) {
    return k.H.useActionState(h, j, M);
  }, w.useCallback = function(h, j) {
    return k.H.useCallback(h, j);
  }, w.useContext = function(h) {
    return k.H.useContext(h);
  }, w.useDebugValue = function() {
  }, w.useDeferredValue = function(h, j) {
    return k.H.useDeferredValue(h, j);
  }, w.useEffect = function(h, j) {
    return k.H.useEffect(h, j);
  }, w.useEffectEvent = function(h) {
    return k.H.useEffectEvent(h);
  }, w.useId = function() {
    return k.H.useId();
  }, w.useImperativeHandle = function(h, j, M) {
    return k.H.useImperativeHandle(h, j, M);
  }, w.useInsertionEffect = function(h, j) {
    return k.H.useInsertionEffect(h, j);
  }, w.useLayoutEffect = function(h, j) {
    return k.H.useLayoutEffect(h, j);
  }, w.useMemo = function(h, j) {
    return k.H.useMemo(h, j);
  }, w.useOptimistic = function(h, j) {
    return k.H.useOptimistic(h, j);
  }, w.useReducer = function(h, j, M) {
    return k.H.useReducer(h, j, M);
  }, w.useRef = function(h) {
    return k.H.useRef(h);
  }, w.useState = function(h) {
    return k.H.useState(h);
  }, w.useSyncExternalStore = function(h, j, M) {
    return k.H.useSyncExternalStore(
      h,
      j,
      M
    );
  }, w.useTransition = function() {
    return k.H.useTransition();
  }, w.version = "19.2.4", w;
}
var Vo;
function Lf() {
  return Vo || (Vo = 1, Cf.exports = j0()), Cf.exports;
}
var I = Lf(), Rf = { exports: {} }, Zu = {}, Hf = { exports: {} }, Bf = {};
var Ko;
function _0() {
  return Ko || (Ko = 1, (function(s) {
    function m(x, D) {
      var V = x.length;
      x.push(D);
      l: for (; 0 < V; ) {
        var sl = V - 1 >>> 1, rl = x[sl];
        if (0 < O(rl, D))
          x[sl] = D, x[V] = rl, V = sl;
        else break l;
      }
    }
    function _(x) {
      return x.length === 0 ? null : x[0];
    }
    function r(x) {
      if (x.length === 0) return null;
      var D = x[0], V = x.pop();
      if (V !== D) {
        x[0] = V;
        l: for (var sl = 0, rl = x.length, h = rl >>> 1; sl < h; ) {
          var j = 2 * (sl + 1) - 1, M = x[j], q = j + 1, K = x[q];
          if (0 > O(M, V))
            q < rl && 0 > O(K, M) ? (x[sl] = K, x[q] = V, sl = q) : (x[sl] = M, x[j] = V, sl = j);
          else if (q < rl && 0 > O(K, V))
            x[sl] = K, x[q] = V, sl = q;
          else break l;
        }
      }
      return D;
    }
    function O(x, D) {
      var V = x.sortIndex - D.sortIndex;
      return V !== 0 ? V : x.id - D.id;
    }
    if (s.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var C = performance;
      s.unstable_now = function() {
        return C.now();
      };
    } else {
      var R = Date, B = R.now();
      s.unstable_now = function() {
        return R.now() - B;
      };
    }
    var E = [], p = [], X = 1, N = null, U = 3, Y = !1, cl = !1, J = !1, kl = !1, Hl = typeof setTimeout == "function" ? setTimeout : null, tt = typeof clearTimeout == "function" ? clearTimeout : null, xl = typeof setImmediate < "u" ? setImmediate : null;
    function Ll(x) {
      for (var D = _(p); D !== null; ) {
        if (D.callback === null) r(p);
        else if (D.startTime <= x)
          r(p), D.sortIndex = D.expirationTime, m(E, D);
        else break;
        D = _(p);
      }
    }
    function at(x) {
      if (J = !1, Ll(x), !cl)
        if (_(E) !== null)
          cl = !0, Bl || (Bl = !0, Fl());
        else {
          var D = _(p);
          D !== null && dt(at, D.startTime - x);
        }
    }
    var Bl = !1, k = -1, Ul = 5, jl = -1;
    function fa() {
      return kl ? !0 : !(s.unstable_now() - jl < Ul);
    }
    function rt() {
      if (kl = !1, Bl) {
        var x = s.unstable_now();
        jl = x;
        var D = !0;
        try {
          l: {
            cl = !1, J && (J = !1, tt(k), k = -1), Y = !0;
            var V = U;
            try {
              t: {
                for (Ll(x), N = _(E); N !== null && !(N.expirationTime > x && fa()); ) {
                  var sl = N.callback;
                  if (typeof sl == "function") {
                    N.callback = null, U = N.priorityLevel;
                    var rl = sl(
                      N.expirationTime <= x
                    );
                    if (x = s.unstable_now(), typeof rl == "function") {
                      N.callback = rl, Ll(x), D = !0;
                      break t;
                    }
                    N === _(E) && r(E), Ll(x);
                  } else r(E);
                  N = _(E);
                }
                if (N !== null) D = !0;
                else {
                  var h = _(p);
                  h !== null && dt(
                    at,
                    h.startTime - x
                  ), D = !1;
                }
              }
              break l;
            } finally {
              N = null, U = V, Y = !1;
            }
            D = void 0;
          }
        } finally {
          D ? Fl() : Bl = !1;
        }
      }
    }
    var Fl;
    if (typeof xl == "function")
      Fl = function() {
        xl(rt);
      };
    else if (typeof MessageChannel < "u") {
      var Dt = new MessageChannel(), bt = Dt.port2;
      Dt.port1.onmessage = rt, Fl = function() {
        bt.postMessage(null);
      };
    } else
      Fl = function() {
        Hl(rt, 0);
      };
    function dt(x, D) {
      k = Hl(function() {
        x(s.unstable_now());
      }, D);
    }
    s.unstable_IdlePriority = 5, s.unstable_ImmediatePriority = 1, s.unstable_LowPriority = 4, s.unstable_NormalPriority = 3, s.unstable_Profiling = null, s.unstable_UserBlockingPriority = 2, s.unstable_cancelCallback = function(x) {
      x.callback = null;
    }, s.unstable_forceFrameRate = function(x) {
      0 > x || 125 < x ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : Ul = 0 < x ? Math.floor(1e3 / x) : 5;
    }, s.unstable_getCurrentPriorityLevel = function() {
      return U;
    }, s.unstable_next = function(x) {
      switch (U) {
        case 1:
        case 2:
        case 3:
          var D = 3;
          break;
        default:
          D = U;
      }
      var V = U;
      U = D;
      try {
        return x();
      } finally {
        U = V;
      }
    }, s.unstable_requestPaint = function() {
      kl = !0;
    }, s.unstable_runWithPriority = function(x, D) {
      switch (x) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          x = 3;
      }
      var V = U;
      U = x;
      try {
        return D();
      } finally {
        U = V;
      }
    }, s.unstable_scheduleCallback = function(x, D, V) {
      var sl = s.unstable_now();
      switch (typeof V == "object" && V !== null ? (V = V.delay, V = typeof V == "number" && 0 < V ? sl + V : sl) : V = sl, x) {
        case 1:
          var rl = -1;
          break;
        case 2:
          rl = 250;
          break;
        case 5:
          rl = 1073741823;
          break;
        case 4:
          rl = 1e4;
          break;
        default:
          rl = 5e3;
      }
      return rl = V + rl, x = {
        id: X++,
        callback: D,
        priorityLevel: x,
        startTime: V,
        expirationTime: rl,
        sortIndex: -1
      }, V > sl ? (x.sortIndex = V, m(p, x), _(E) === null && x === _(p) && (J ? (tt(k), k = -1) : J = !0, dt(at, V - sl))) : (x.sortIndex = rl, m(E, x), cl || Y || (cl = !0, Bl || (Bl = !0, Fl()))), x;
    }, s.unstable_shouldYield = fa, s.unstable_wrapCallback = function(x) {
      var D = U;
      return function() {
        var V = U;
        U = D;
        try {
          return x.apply(this, arguments);
        } finally {
          U = V;
        }
      };
    };
  })(Bf)), Bf;
}
var Jo;
function O0() {
  return Jo || (Jo = 1, Hf.exports = _0()), Hf.exports;
}
var qf = { exports: {} }, $l = {};
var wo;
function N0() {
  if (wo) return $l;
  wo = 1;
  var s = Lf();
  function m(E) {
    var p = "https://react.dev/errors/" + E;
    if (1 < arguments.length) {
      p += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var X = 2; X < arguments.length; X++)
        p += "&args[]=" + encodeURIComponent(arguments[X]);
    }
    return "Minified React error #" + E + "; visit " + p + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function _() {
  }
  var r = {
    d: {
      f: _,
      r: function() {
        throw Error(m(522));
      },
      D: _,
      C: _,
      L: _,
      m: _,
      X: _,
      S: _,
      M: _
    },
    p: 0,
    findDOMNode: null
  }, O = /* @__PURE__ */ Symbol.for("react.portal");
  function C(E, p, X) {
    var N = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: O,
      key: N == null ? null : "" + N,
      children: E,
      containerInfo: p,
      implementation: X
    };
  }
  var R = s.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function B(E, p) {
    if (E === "font") return "";
    if (typeof p == "string")
      return p === "use-credentials" ? p : "";
  }
  return $l.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = r, $l.createPortal = function(E, p) {
    var X = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!p || p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11)
      throw Error(m(299));
    return C(E, p, null, X);
  }, $l.flushSync = function(E) {
    var p = R.T, X = r.p;
    try {
      if (R.T = null, r.p = 2, E) return E();
    } finally {
      R.T = p, r.p = X, r.d.f();
    }
  }, $l.preconnect = function(E, p) {
    typeof E == "string" && (p ? (p = p.crossOrigin, p = typeof p == "string" ? p === "use-credentials" ? p : "" : void 0) : p = null, r.d.C(E, p));
  }, $l.prefetchDNS = function(E) {
    typeof E == "string" && r.d.D(E);
  }, $l.preinit = function(E, p) {
    if (typeof E == "string" && p && typeof p.as == "string") {
      var X = p.as, N = B(X, p.crossOrigin), U = typeof p.integrity == "string" ? p.integrity : void 0, Y = typeof p.fetchPriority == "string" ? p.fetchPriority : void 0;
      X === "style" ? r.d.S(
        E,
        typeof p.precedence == "string" ? p.precedence : void 0,
        {
          crossOrigin: N,
          integrity: U,
          fetchPriority: Y
        }
      ) : X === "script" && r.d.X(E, {
        crossOrigin: N,
        integrity: U,
        fetchPriority: Y,
        nonce: typeof p.nonce == "string" ? p.nonce : void 0
      });
    }
  }, $l.preinitModule = function(E, p) {
    if (typeof E == "string")
      if (typeof p == "object" && p !== null) {
        if (p.as == null || p.as === "script") {
          var X = B(
            p.as,
            p.crossOrigin
          );
          r.d.M(E, {
            crossOrigin: X,
            integrity: typeof p.integrity == "string" ? p.integrity : void 0,
            nonce: typeof p.nonce == "string" ? p.nonce : void 0
          });
        }
      } else p == null && r.d.M(E);
  }, $l.preload = function(E, p) {
    if (typeof E == "string" && typeof p == "object" && p !== null && typeof p.as == "string") {
      var X = p.as, N = B(X, p.crossOrigin);
      r.d.L(E, X, {
        crossOrigin: N,
        integrity: typeof p.integrity == "string" ? p.integrity : void 0,
        nonce: typeof p.nonce == "string" ? p.nonce : void 0,
        type: typeof p.type == "string" ? p.type : void 0,
        fetchPriority: typeof p.fetchPriority == "string" ? p.fetchPriority : void 0,
        referrerPolicy: typeof p.referrerPolicy == "string" ? p.referrerPolicy : void 0,
        imageSrcSet: typeof p.imageSrcSet == "string" ? p.imageSrcSet : void 0,
        imageSizes: typeof p.imageSizes == "string" ? p.imageSizes : void 0,
        media: typeof p.media == "string" ? p.media : void 0
      });
    }
  }, $l.preloadModule = function(E, p) {
    if (typeof E == "string")
      if (p) {
        var X = B(p.as, p.crossOrigin);
        r.d.m(E, {
          as: typeof p.as == "string" && p.as !== "script" ? p.as : void 0,
          crossOrigin: X,
          integrity: typeof p.integrity == "string" ? p.integrity : void 0
        });
      } else r.d.m(E);
  }, $l.requestFormReset = function(E) {
    r.d.r(E);
  }, $l.unstable_batchedUpdates = function(E, p) {
    return E(p);
  }, $l.useFormState = function(E, p, X) {
    return R.H.useFormState(E, p, X);
  }, $l.useFormStatus = function() {
    return R.H.useHostTransitionStatus();
  }, $l.version = "19.2.4", $l;
}
var ko;
function U0() {
  if (ko) return qf.exports;
  ko = 1;
  function s() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(s);
      } catch (m) {
        console.error(m);
      }
  }
  return s(), qf.exports = N0(), qf.exports;
}
var Fo;
function M0() {
  if (Fo) return Zu;
  Fo = 1;
  var s = O0(), m = Lf(), _ = U0();
  function r(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++)
        t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function O(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function C(l) {
    var t = l, a = l;
    if (l.alternate) for (; t.return; ) t = t.return;
    else {
      l = t;
      do
        t = l, (t.flags & 4098) !== 0 && (a = t.return), l = t.return;
      while (l);
    }
    return t.tag === 3 ? a : null;
  }
  function R(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function B(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function E(l) {
    if (C(l) !== l)
      throw Error(r(188));
  }
  function p(l) {
    var t = l.alternate;
    if (!t) {
      if (t = C(l), t === null) throw Error(r(188));
      return t !== l ? null : l;
    }
    for (var a = l, e = t; ; ) {
      var u = a.return;
      if (u === null) break;
      var n = u.alternate;
      if (n === null) {
        if (e = u.return, e !== null) {
          a = e;
          continue;
        }
        break;
      }
      if (u.child === n.child) {
        for (n = u.child; n; ) {
          if (n === a) return E(u), l;
          if (n === e) return E(u), t;
          n = n.sibling;
        }
        throw Error(r(188));
      }
      if (a.return !== e.return) a = u, e = n;
      else {
        for (var i = !1, c = u.child; c; ) {
          if (c === a) {
            i = !0, a = u, e = n;
            break;
          }
          if (c === e) {
            i = !0, e = u, a = n;
            break;
          }
          c = c.sibling;
        }
        if (!i) {
          for (c = n.child; c; ) {
            if (c === a) {
              i = !0, a = n, e = u;
              break;
            }
            if (c === e) {
              i = !0, e = n, a = u;
              break;
            }
            c = c.sibling;
          }
          if (!i) throw Error(r(189));
        }
      }
      if (a.alternate !== e) throw Error(r(190));
    }
    if (a.tag !== 3) throw Error(r(188));
    return a.stateNode.current === a ? l : t;
  }
  function X(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = X(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var N = Object.assign, U = /* @__PURE__ */ Symbol.for("react.element"), Y = /* @__PURE__ */ Symbol.for("react.transitional.element"), cl = /* @__PURE__ */ Symbol.for("react.portal"), J = /* @__PURE__ */ Symbol.for("react.fragment"), kl = /* @__PURE__ */ Symbol.for("react.strict_mode"), Hl = /* @__PURE__ */ Symbol.for("react.profiler"), tt = /* @__PURE__ */ Symbol.for("react.consumer"), xl = /* @__PURE__ */ Symbol.for("react.context"), Ll = /* @__PURE__ */ Symbol.for("react.forward_ref"), at = /* @__PURE__ */ Symbol.for("react.suspense"), Bl = /* @__PURE__ */ Symbol.for("react.suspense_list"), k = /* @__PURE__ */ Symbol.for("react.memo"), Ul = /* @__PURE__ */ Symbol.for("react.lazy"), jl = /* @__PURE__ */ Symbol.for("react.activity"), fa = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), rt = Symbol.iterator;
  function Fl(l) {
    return l === null || typeof l != "object" ? null : (l = rt && l[rt] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Dt = /* @__PURE__ */ Symbol.for("react.client.reference");
  function bt(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === Dt ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case J:
        return "Fragment";
      case Hl:
        return "Profiler";
      case kl:
        return "StrictMode";
      case at:
        return "Suspense";
      case Bl:
        return "SuspenseList";
      case jl:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case cl:
          return "Portal";
        case xl:
          return l.displayName || "Context";
        case tt:
          return (l._context.displayName || "Context") + ".Consumer";
        case Ll:
          var t = l.render;
          return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case k:
          return t = l.displayName || null, t !== null ? t : bt(l.type) || "Memo";
        case Ul:
          t = l._payload, l = l._init;
          try {
            return bt(l(t));
          } catch {
          }
      }
    return null;
  }
  var dt = Array.isArray, x = m.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = _.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, V = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, sl = [], rl = -1;
  function h(l) {
    return { current: l };
  }
  function j(l) {
    0 > rl || (l.current = sl[rl], sl[rl] = null, rl--);
  }
  function M(l, t) {
    rl++, sl[rl] = l.current, l.current = t;
  }
  var q = h(null), K = h(null), $ = h(null), tl = h(null);
  function Yl(l, t) {
    switch (M($, t), M(K, l), M(q, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? so(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI)
          t = so(t), l = ro(t, l);
        else
          switch (l) {
            case "svg":
              l = 1;
              break;
            case "math":
              l = 2;
              break;
            default:
              l = 0;
          }
    }
    j(q), M(q, l);
  }
  function Al() {
    j(q), j(K), j($);
  }
  function qa(l) {
    l.memoizedState !== null && M(tl, l);
    var t = q.current, a = ro(t, l.type);
    t !== a && (M(K, l), M(q, a));
  }
  function Ya(l) {
    K.current === l && (j(q), j(K)), tl.current === l && (j(tl), Yu._currentValue = V);
  }
  var we, ke;
  function Yt(l) {
    if (we === void 0)
      try {
        throw Error();
      } catch (a) {
        var t = a.stack.trim().match(/\n( *(at )?)/);
        we = t && t[1] || "", ke = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + we + l + ke;
  }
  var sa = !1;
  function ne(l, t) {
    if (!l || sa) return "";
    sa = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var e = {
        DetermineComponentFrameRoot: function() {
          try {
            if (t) {
              var z = function() {
                throw Error();
              };
              if (Object.defineProperty(z.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(z, []);
                } catch (b) {
                  var S = b;
                }
                Reflect.construct(l, [], z);
              } else {
                try {
                  z.call();
                } catch (b) {
                  S = b;
                }
                l.call(z.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (b) {
                S = b;
              }
              (z = l()) && typeof z.catch == "function" && z.catch(function() {
              });
            }
          } catch (b) {
            if (b && S && typeof b.stack == "string")
              return [b.stack, S.stack];
          }
          return [null, null];
        }
      };
      e.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var u = Object.getOwnPropertyDescriptor(
        e.DetermineComponentFrameRoot,
        "name"
      );
      u && u.configurable && Object.defineProperty(
        e.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var n = e.DetermineComponentFrameRoot(), i = n[0], c = n[1];
      if (i && c) {
        var d = i.split(`
`), g = c.split(`
`);
        for (u = e = 0; e < d.length && !d[e].includes("DetermineComponentFrameRoot"); )
          e++;
        for (; u < g.length && !g[u].includes(
          "DetermineComponentFrameRoot"
        ); )
          u++;
        if (e === d.length || u === g.length)
          for (e = d.length - 1, u = g.length - 1; 1 <= e && 0 <= u && d[e] !== g[u]; )
            u--;
        for (; 1 <= e && 0 <= u; e--, u--)
          if (d[e] !== g[u]) {
            if (e !== 1 || u !== 1)
              do
                if (e--, u--, 0 > u || d[e] !== g[u]) {
                  var A = `
` + d[e].replace(" at new ", " at ");
                  return l.displayName && A.includes("<anonymous>") && (A = A.replace("<anonymous>", l.displayName)), A;
                }
              while (1 <= e && 0 <= u);
            break;
          }
      }
    } finally {
      sa = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? Yt(a) : "";
  }
  function si(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return Yt(l.type);
      case 16:
        return Yt("Lazy");
      case 13:
        return l.child !== t && t !== null ? Yt("Suspense Fallback") : Yt("Suspense");
      case 19:
        return Yt("SuspenseList");
      case 0:
      case 15:
        return ne(l.type, !1);
      case 11:
        return ne(l.type.render, !1);
      case 1:
        return ne(l.type, !0);
      case 31:
        return Yt("Activity");
      default:
        return "";
    }
  }
  function Ga(l) {
    try {
      var t = "", a = null;
      do
        t += si(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (e) {
      return `
Error generating stack: ` + e.message + `
` + e.stack;
    }
  }
  var Fe = Object.prototype.hasOwnProperty, We = s.unstable_scheduleCallback, Wl = s.unstable_cancelCallback, ri = s.unstable_shouldYield, di = s.unstable_requestPaint, Il = s.unstable_now, oi = s.unstable_getCurrentPriorityLevel, Ku = s.unstable_ImmediatePriority, Ju = s.unstable_UserBlockingPriority, ie = s.unstable_NormalPriority, hi = s.unstable_LowPriority, wu = s.unstable_IdlePriority, mi = s.log, vi = s.unstable_setDisableYieldValue, Qa = null, L = null;
  function gl(l) {
    if (typeof mi == "function" && vi(l), L && typeof L.setStrictMode == "function")
      try {
        L.setStrictMode(Qa, l);
      } catch {
      }
  }
  var _l = Math.clz32 ? Math.clz32 : Si, yi = Math.log, gi = Math.LN2;
  function Si(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (yi(l) / gi | 0) | 0;
  }
  var ce = 256, Xa = 262144, fe = 4194304;
  function pt(l) {
    var t = l & 42;
    if (t !== 0) return t;
    switch (l & -l) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return l & 261888;
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return l & 3932160;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return l & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return l;
    }
  }
  function ku(l, t, a) {
    var e = l.pendingLanes;
    if (e === 0) return 0;
    var u = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = e & 134217727;
    return c !== 0 ? (e = c & ~n, e !== 0 ? u = pt(e) : (i &= c, i !== 0 ? u = pt(i) : a || (a = c & ~l, a !== 0 && (u = pt(a))))) : (c = e & ~n, c !== 0 ? u = pt(c) : i !== 0 ? u = pt(i) : a || (a = e & ~l, a !== 0 && (u = pt(a)))), u === 0 ? 0 : t !== 0 && t !== u && (t & n) === 0 && (n = u & -u, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : u;
  }
  function $e(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function dh(l, t) {
    switch (l) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function Vf() {
    var l = fe;
    return fe <<= 1, (fe & 62914560) === 0 && (fe = 4194304), l;
  }
  function bi(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Ie(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function oh(l, t, a, e, u, n) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, d = l.expirationTimes, g = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var A = 31 - _l(a), z = 1 << A;
      c[A] = 0, d[A] = -1;
      var S = g[A];
      if (S !== null)
        for (g[A] = null, A = 0; A < S.length; A++) {
          var b = S[A];
          b !== null && (b.lane &= -536870913);
        }
      a &= ~z;
    }
    e !== 0 && Kf(l, e, 0), n !== 0 && u === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function Kf(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var e = 31 - _l(t);
    l.entangledLanes |= t, l.entanglements[e] = l.entanglements[e] | 1073741824 | a & 261930;
  }
  function Jf(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var e = 31 - _l(a), u = 1 << e;
      u & t | l[e] & t && (l[e] |= t), a &= ~u;
    }
  }
  function wf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : pi(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function pi(l) {
    switch (l) {
      case 2:
        l = 1;
        break;
      case 8:
        l = 4;
        break;
      case 32:
        l = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        l = 128;
        break;
      case 268435456:
        l = 134217728;
        break;
      default:
        l = 0;
    }
    return l;
  }
  function Ei(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function kf() {
    var l = D.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : Ro(l.type));
  }
  function Ff(l, t) {
    var a = D.p;
    try {
      return D.p = l, t();
    } finally {
      D.p = a;
    }
  }
  var ra = Math.random().toString(36).slice(2), Zl = "__reactFiber$" + ra, et = "__reactProps$" + ra, se = "__reactContainer$" + ra, Ai = "__reactEvents$" + ra, hh = "__reactListeners$" + ra, mh = "__reactHandles$" + ra, Wf = "__reactResources$" + ra, Pe = "__reactMarker$" + ra;
  function xi(l) {
    delete l[Zl], delete l[et], delete l[Ai], delete l[hh], delete l[mh];
  }
  function re(l) {
    var t = l[Zl];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[se] || a[Zl]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null)
          for (l = So(l); l !== null; ) {
            if (a = l[Zl]) return a;
            l = So(l);
          }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function de(l) {
    if (l = l[Zl] || l[se]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3)
        return l;
    }
    return null;
  }
  function lu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(r(33));
  }
  function oe(l) {
    var t = l[Wf];
    return t || (t = l[Wf] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function Gl(l) {
    l[Pe] = !0;
  }
  var $f = /* @__PURE__ */ new Set(), If = {};
  function La(l, t) {
    he(l, t), he(l + "Capture", t);
  }
  function he(l, t) {
    for (If[l] = t, l = 0; l < t.length; l++)
      $f.add(t[l]);
  }
  var vh = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Pf = {}, ls = {};
  function yh(l) {
    return Fe.call(ls, l) ? !0 : Fe.call(Pf, l) ? !1 : vh.test(l) ? ls[l] = !0 : (Pf[l] = !0, !1);
  }
  function Fu(l, t, a) {
    if (yh(t))
      if (a === null) l.removeAttribute(t);
      else {
        switch (typeof a) {
          case "undefined":
          case "function":
          case "symbol":
            l.removeAttribute(t);
            return;
          case "boolean":
            var e = t.toLowerCase().slice(0, 5);
            if (e !== "data-" && e !== "aria-") {
              l.removeAttribute(t);
              return;
            }
        }
        l.setAttribute(t, "" + a);
      }
  }
  function Wu(l, t, a) {
    if (a === null) l.removeAttribute(t);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(t);
          return;
      }
      l.setAttribute(t, "" + a);
    }
  }
  function Vt(l, t, a, e) {
    if (e === null) l.removeAttribute(a);
    else {
      switch (typeof e) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(a);
          return;
      }
      l.setAttributeNS(t, a, "" + e);
    }
  }
  function Et(l) {
    switch (typeof l) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return l;
      case "object":
        return l;
      default:
        return "";
    }
  }
  function ts(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function gh(l, t, a) {
    var e = Object.getOwnPropertyDescriptor(
      l.constructor.prototype,
      t
    );
    if (!l.hasOwnProperty(t) && typeof e < "u" && typeof e.get == "function" && typeof e.set == "function") {
      var u = e.get, n = e.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return u.call(this);
        },
        set: function(i) {
          a = "" + i, n.call(this, i);
        }
      }), Object.defineProperty(l, t, {
        enumerable: e.enumerable
      }), {
        getValue: function() {
          return a;
        },
        setValue: function(i) {
          a = "" + i;
        },
        stopTracking: function() {
          l._valueTracker = null, delete l[t];
        }
      };
    }
  }
  function Ti(l) {
    if (!l._valueTracker) {
      var t = ts(l) ? "checked" : "value";
      l._valueTracker = gh(
        l,
        t,
        "" + l[t]
      );
    }
  }
  function as(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), e = "";
    return l && (e = ts(l) ? l.checked ? "true" : "false" : l.value), l = e, l !== a ? (t.setValue(l), !0) : !1;
  }
  function $u(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var Sh = /[\n"\\]/g;
  function At(l) {
    return l.replace(
      Sh,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function zi(l, t, a, e, u, n, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + Et(t)) : l.value !== "" + Et(t) && (l.value = "" + Et(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? ji(l, i, Et(t)) : a != null ? ji(l, i, Et(a)) : e != null && l.removeAttribute("value"), u == null && n != null && (l.defaultChecked = !!n), u != null && (l.checked = u && typeof u != "function" && typeof u != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + Et(c) : l.removeAttribute("name");
  }
  function es(l, t, a, e, u, n, i, c) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        Ti(l);
        return;
      }
      a = a != null ? "" + Et(a) : "", t = t != null ? "" + Et(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    e = e ?? u, e = typeof e != "function" && typeof e != "symbol" && !!e, l.checked = c ? l.checked : !!e, l.defaultChecked = !!e, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), Ti(l);
  }
  function ji(l, t, a) {
    t === "number" && $u(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function me(l, t, a, e) {
    if (l = l.options, t) {
      t = {};
      for (var u = 0; u < a.length; u++)
        t["$" + a[u]] = !0;
      for (a = 0; a < l.length; a++)
        u = t.hasOwnProperty("$" + l[a].value), l[a].selected !== u && (l[a].selected = u), u && e && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + Et(a), t = null, u = 0; u < l.length; u++) {
        if (l[u].value === a) {
          l[u].selected = !0, e && (l[u].defaultSelected = !0);
          return;
        }
        t !== null || l[u].disabled || (t = l[u]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function us(l, t, a) {
    if (t != null && (t = "" + Et(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + Et(a) : "";
  }
  function ns(l, t, a, e) {
    if (t == null) {
      if (e != null) {
        if (a != null) throw Error(r(92));
        if (dt(e)) {
          if (1 < e.length) throw Error(r(93));
          e = e[0];
        }
        a = e;
      }
      a == null && (a = ""), t = a;
    }
    a = Et(t), l.defaultValue = a, e = l.textContent, e === a && e !== "" && e !== null && (l.value = e), Ti(l);
  }
  function ve(l, t) {
    if (t) {
      var a = l.firstChild;
      if (a && a === l.lastChild && a.nodeType === 3) {
        a.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var bh = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function is(l, t, a) {
    var e = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? e ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : e ? l.setProperty(t, a) : typeof a != "number" || a === 0 || bh.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function cs(l, t, a) {
    if (t != null && typeof t != "object")
      throw Error(r(62));
    if (l = l.style, a != null) {
      for (var e in a)
        !a.hasOwnProperty(e) || t != null && t.hasOwnProperty(e) || (e.indexOf("--") === 0 ? l.setProperty(e, "") : e === "float" ? l.cssFloat = "" : l[e] = "");
      for (var u in t)
        e = t[u], t.hasOwnProperty(u) && a[u] !== e && is(l, u, e);
    } else
      for (var n in t)
        t.hasOwnProperty(n) && is(l, n, t[n]);
  }
  function _i(l) {
    if (l.indexOf("-") === -1) return !1;
    switch (l) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var ph = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), Eh = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Iu(l) {
    return Eh.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Kt() {
  }
  var Oi = null;
  function Ni(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var ye = null, ge = null;
  function fs(l) {
    var t = de(l);
    if (t && (l = t.stateNode)) {
      var a = l[et] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (zi(
            l,
            a.value,
            a.defaultValue,
            a.defaultValue,
            a.checked,
            a.defaultChecked,
            a.type,
            a.name
          ), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll(
              'input[name="' + At(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < a.length; t++) {
              var e = a[t];
              if (e !== l && e.form === l.form) {
                var u = e[et] || null;
                if (!u) throw Error(r(90));
                zi(
                  e,
                  u.value,
                  u.defaultValue,
                  u.defaultValue,
                  u.checked,
                  u.defaultChecked,
                  u.type,
                  u.name
                );
              }
            }
            for (t = 0; t < a.length; t++)
              e = a[t], e.form === l.form && as(e);
          }
          break l;
        case "textarea":
          us(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && me(l, !!a.multiple, t, !1);
      }
    }
  }
  var Ui = !1;
  function ss(l, t, a) {
    if (Ui) return l(t, a);
    Ui = !0;
    try {
      var e = l(t);
      return e;
    } finally {
      if (Ui = !1, (ye !== null || ge !== null) && (Qn(), ye && (t = ye, l = ge, ge = ye = null, fs(t), l)))
        for (t = 0; t < l.length; t++) fs(l[t]);
    }
  }
  function tu(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var e = a[et] || null;
    if (e === null) return null;
    a = e[t];
    l: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (e = !e.disabled) || (l = l.type, e = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !e;
        break l;
      default:
        l = !1;
    }
    if (l) return null;
    if (a && typeof a != "function")
      throw Error(
        r(231, t, typeof a)
      );
    return a;
  }
  var Jt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Mi = !1;
  if (Jt)
    try {
      var au = {};
      Object.defineProperty(au, "passive", {
        get: function() {
          Mi = !0;
        }
      }), window.addEventListener("test", au, au), window.removeEventListener("test", au, au);
    } catch {
      Mi = !1;
    }
  var da = null, Di = null, Pu = null;
  function rs() {
    if (Pu) return Pu;
    var l, t = Di, a = t.length, e, u = "value" in da ? da.value : da.textContent, n = u.length;
    for (l = 0; l < a && t[l] === u[l]; l++) ;
    var i = a - l;
    for (e = 1; e <= i && t[a - e] === u[n - e]; e++) ;
    return Pu = u.slice(l, 1 < e ? 1 - e : void 0);
  }
  function ln(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function tn() {
    return !0;
  }
  function ds() {
    return !1;
  }
  function ut(l) {
    function t(a, e, u, n, i) {
      this._reactName = a, this._targetInst = u, this.type = e, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var c in l)
        l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(n) : n[c]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? tn : ds, this.isPropagationStopped = ds, this;
    }
    return N(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = tn);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = tn);
      },
      persist: function() {
      },
      isPersistent: tn
    }), t;
  }
  var Za = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, an = ut(Za), eu = N({}, Za, { view: 0, detail: 0 }), Ah = ut(eu), Ci, Ri, uu, en = N({}, eu, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: Bi,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== uu && (uu && l.type === "mousemove" ? (Ci = l.screenX - uu.screenX, Ri = l.screenY - uu.screenY) : Ri = Ci = 0, uu = l), Ci);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : Ri;
    }
  }), os = ut(en), xh = N({}, en, { dataTransfer: 0 }), Th = ut(xh), zh = N({}, eu, { relatedTarget: 0 }), Hi = ut(zh), jh = N({}, Za, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), _h = ut(jh), Oh = N({}, Za, {
    clipboardData: function(l) {
      return "clipboardData" in l ? l.clipboardData : window.clipboardData;
    }
  }), Nh = ut(Oh), Uh = N({}, Za, { data: 0 }), hs = ut(Uh), Mh = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  }, Dh = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  }, Ch = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Rh(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Ch[l]) ? !!t[l] : !1;
  }
  function Bi() {
    return Rh;
  }
  var Hh = N({}, eu, {
    key: function(l) {
      if (l.key) {
        var t = Mh[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = ln(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Dh[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: Bi,
    charCode: function(l) {
      return l.type === "keypress" ? ln(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? ln(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  }), Bh = ut(Hh), qh = N({}, en, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  }), ms = ut(qh), Yh = N({}, eu, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: Bi
  }), Gh = ut(Yh), Qh = N({}, Za, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Xh = ut(Qh), Lh = N({}, en, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), Zh = ut(Lh), Vh = N({}, Za, {
    newState: 0,
    oldState: 0
  }), Kh = ut(Vh), Jh = [9, 13, 27, 32], qi = Jt && "CompositionEvent" in window, nu = null;
  Jt && "documentMode" in document && (nu = document.documentMode);
  var wh = Jt && "TextEvent" in window && !nu, vs = Jt && (!qi || nu && 8 < nu && 11 >= nu), ys = " ", gs = !1;
  function Ss(l, t) {
    switch (l) {
      case "keyup":
        return Jh.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function bs(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Se = !1;
  function kh(l, t) {
    switch (l) {
      case "compositionend":
        return bs(t);
      case "keypress":
        return t.which !== 32 ? null : (gs = !0, ys);
      case "textInput":
        return l = t.data, l === ys && gs ? null : l;
      default:
        return null;
    }
  }
  function Fh(l, t) {
    if (Se)
      return l === "compositionend" || !qi && Ss(l, t) ? (l = rs(), Pu = Di = da = null, Se = !1, l) : null;
    switch (l) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length)
            return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return vs && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Wh = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0
  };
  function ps(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Wh[l.type] : t === "textarea";
  }
  function Es(l, t, a, e) {
    ye ? ge ? ge.push(e) : ge = [e] : ye = e, t = wn(t, "onChange"), 0 < t.length && (a = new an(
      "onChange",
      "change",
      null,
      a,
      e
    ), l.push({ event: a, listeners: t }));
  }
  var iu = null, cu = null;
  function $h(l) {
    eo(l, 0);
  }
  function un(l) {
    var t = lu(l);
    if (as(t)) return l;
  }
  function As(l, t) {
    if (l === "change") return t;
  }
  var xs = !1;
  if (Jt) {
    var Yi;
    if (Jt) {
      var Gi = "oninput" in document;
      if (!Gi) {
        var Ts = document.createElement("div");
        Ts.setAttribute("oninput", "return;"), Gi = typeof Ts.oninput == "function";
      }
      Yi = Gi;
    } else Yi = !1;
    xs = Yi && (!document.documentMode || 9 < document.documentMode);
  }
  function zs() {
    iu && (iu.detachEvent("onpropertychange", js), cu = iu = null);
  }
  function js(l) {
    if (l.propertyName === "value" && un(cu)) {
      var t = [];
      Es(
        t,
        cu,
        l,
        Ni(l)
      ), ss($h, t);
    }
  }
  function Ih(l, t, a) {
    l === "focusin" ? (zs(), iu = t, cu = a, iu.attachEvent("onpropertychange", js)) : l === "focusout" && zs();
  }
  function Ph(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown")
      return un(cu);
  }
  function lm(l, t) {
    if (l === "click") return un(t);
  }
  function tm(l, t) {
    if (l === "input" || l === "change")
      return un(t);
  }
  function am(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var ot = typeof Object.is == "function" ? Object.is : am;
  function fu(l, t) {
    if (ot(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null)
      return !1;
    var a = Object.keys(l), e = Object.keys(t);
    if (a.length !== e.length) return !1;
    for (e = 0; e < a.length; e++) {
      var u = a[e];
      if (!Fe.call(t, u) || !ot(l[u], t[u]))
        return !1;
    }
    return !0;
  }
  function _s(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function Os(l, t) {
    var a = _s(l);
    l = 0;
    for (var e; a; ) {
      if (a.nodeType === 3) {
        if (e = l + a.textContent.length, l <= t && e >= t)
          return { node: a, offset: t - l };
        l = e;
      }
      l: {
        for (; a; ) {
          if (a.nextSibling) {
            a = a.nextSibling;
            break l;
          }
          a = a.parentNode;
        }
        a = void 0;
      }
      a = _s(a);
    }
  }
  function Ns(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Ns(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Us(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = $u(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = $u(l.document);
    }
    return t;
  }
  function Qi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var em = Jt && "documentMode" in document && 11 >= document.documentMode, be = null, Xi = null, su = null, Li = !1;
  function Ms(l, t, a) {
    var e = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    Li || be == null || be !== $u(e) || (e = be, "selectionStart" in e && Qi(e) ? e = { start: e.selectionStart, end: e.selectionEnd } : (e = (e.ownerDocument && e.ownerDocument.defaultView || window).getSelection(), e = {
      anchorNode: e.anchorNode,
      anchorOffset: e.anchorOffset,
      focusNode: e.focusNode,
      focusOffset: e.focusOffset
    }), su && fu(su, e) || (su = e, e = wn(Xi, "onSelect"), 0 < e.length && (t = new an(
      "onSelect",
      "select",
      null,
      t,
      a
    ), l.push({ event: t, listeners: e }), t.target = be)));
  }
  function Va(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var pe = {
    animationend: Va("Animation", "AnimationEnd"),
    animationiteration: Va("Animation", "AnimationIteration"),
    animationstart: Va("Animation", "AnimationStart"),
    transitionrun: Va("Transition", "TransitionRun"),
    transitionstart: Va("Transition", "TransitionStart"),
    transitioncancel: Va("Transition", "TransitionCancel"),
    transitionend: Va("Transition", "TransitionEnd")
  }, Zi = {}, Ds = {};
  Jt && (Ds = document.createElement("div").style, "AnimationEvent" in window || (delete pe.animationend.animation, delete pe.animationiteration.animation, delete pe.animationstart.animation), "TransitionEvent" in window || delete pe.transitionend.transition);
  function Ka(l) {
    if (Zi[l]) return Zi[l];
    if (!pe[l]) return l;
    var t = pe[l], a;
    for (a in t)
      if (t.hasOwnProperty(a) && a in Ds)
        return Zi[l] = t[a];
    return l;
  }
  var Cs = Ka("animationend"), Rs = Ka("animationiteration"), Hs = Ka("animationstart"), um = Ka("transitionrun"), nm = Ka("transitionstart"), im = Ka("transitioncancel"), Bs = Ka("transitionend"), qs = /* @__PURE__ */ new Map(), Vi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  Vi.push("scrollEnd");
  function Ct(l, t) {
    qs.set(l, t), La(t, [l]);
  }
  var nn = typeof reportError == "function" ? reportError : function(l) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof l == "object" && l !== null && typeof l.message == "string" ? String(l.message) : String(l),
        error: l
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", l);
      return;
    }
    console.error(l);
  }, xt = [], Ee = 0, Ki = 0;
  function cn() {
    for (var l = Ee, t = Ki = Ee = 0; t < l; ) {
      var a = xt[t];
      xt[t++] = null;
      var e = xt[t];
      xt[t++] = null;
      var u = xt[t];
      xt[t++] = null;
      var n = xt[t];
      if (xt[t++] = null, e !== null && u !== null) {
        var i = e.pending;
        i === null ? u.next = u : (u.next = i.next, i.next = u), e.pending = u;
      }
      n !== 0 && Ys(a, u, n);
    }
  }
  function fn(l, t, a, e) {
    xt[Ee++] = l, xt[Ee++] = t, xt[Ee++] = a, xt[Ee++] = e, Ki |= e, l.lanes |= e, l = l.alternate, l !== null && (l.lanes |= e);
  }
  function Ji(l, t, a, e) {
    return fn(l, t, a, e), sn(l);
  }
  function Ja(l, t) {
    return fn(l, null, null, t), sn(l);
  }
  function Ys(l, t, a) {
    l.lanes |= a;
    var e = l.alternate;
    e !== null && (e.lanes |= a);
    for (var u = !1, n = l.return; n !== null; )
      n.childLanes |= a, e = n.alternate, e !== null && (e.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (u = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, u && t !== null && (u = 31 - _l(a), l = n.hiddenUpdates, e = l[u], e === null ? l[u] = [t] : e.push(t), t.lane = a | 536870912), n) : null;
  }
  function sn(l) {
    if (50 < Mu)
      throw Mu = 0, tf = null, Error(r(185));
    for (var t = l.return; t !== null; )
      l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var Ae = {};
  function cm(l, t, a, e) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = e, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function ht(l, t, a, e) {
    return new cm(l, t, a, e);
  }
  function wi(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function wt(l, t) {
    var a = l.alternate;
    return a === null ? (a = ht(
      l.tag,
      t,
      l.key,
      l.mode
    ), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function Gs(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function rn(l, t, a, e, u, n) {
    var i = 0;
    if (e = l, typeof l == "function") wi(l) && (i = 1);
    else if (typeof l == "string")
      i = o0(
        l,
        a,
        q.current
      ) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else
      l: switch (l) {
        case jl:
          return l = ht(31, a, t, u), l.elementType = jl, l.lanes = n, l;
        case J:
          return wa(a.children, u, n, t);
        case kl:
          i = 8, u |= 24;
          break;
        case Hl:
          return l = ht(12, a, t, u | 2), l.elementType = Hl, l.lanes = n, l;
        case at:
          return l = ht(13, a, t, u), l.elementType = at, l.lanes = n, l;
        case Bl:
          return l = ht(19, a, t, u), l.elementType = Bl, l.lanes = n, l;
        default:
          if (typeof l == "object" && l !== null)
            switch (l.$$typeof) {
              case xl:
                i = 10;
                break l;
              case tt:
                i = 9;
                break l;
              case Ll:
                i = 11;
                break l;
              case k:
                i = 14;
                break l;
              case Ul:
                i = 16, e = null;
                break l;
            }
          i = 29, a = Error(
            r(130, l === null ? "null" : typeof l, "")
          ), e = null;
      }
    return t = ht(i, a, t, u), t.elementType = l, t.type = e, t.lanes = n, t;
  }
  function wa(l, t, a, e) {
    return l = ht(7, l, e, t), l.lanes = a, l;
  }
  function ki(l, t, a) {
    return l = ht(6, l, null, t), l.lanes = a, l;
  }
  function Qs(l) {
    var t = ht(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function Fi(l, t, a) {
    return t = ht(
      4,
      l.children !== null ? l.children : [],
      l.key,
      t
    ), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var Xs = /* @__PURE__ */ new WeakMap();
  function Tt(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = Xs.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: Ga(t)
      }, Xs.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: Ga(t)
    };
  }
  var xe = [], Te = 0, dn = null, ru = 0, zt = [], jt = 0, oa = null, Gt = 1, Qt = "";
  function kt(l, t) {
    xe[Te++] = ru, xe[Te++] = dn, dn = l, ru = t;
  }
  function Ls(l, t, a) {
    zt[jt++] = Gt, zt[jt++] = Qt, zt[jt++] = oa, oa = l;
    var e = Gt;
    l = Qt;
    var u = 32 - _l(e) - 1;
    e &= ~(1 << u), a += 1;
    var n = 32 - _l(t) + u;
    if (30 < n) {
      var i = u - u % 5;
      n = (e & (1 << i) - 1).toString(32), e >>= i, u -= i, Gt = 1 << 32 - _l(t) + u | a << u | e, Qt = n + l;
    } else
      Gt = 1 << n | a << u | e, Qt = l;
  }
  function Wi(l) {
    l.return !== null && (kt(l, 1), Ls(l, 1, 0));
  }
  function $i(l) {
    for (; l === dn; )
      dn = xe[--Te], xe[Te] = null, ru = xe[--Te], xe[Te] = null;
    for (; l === oa; )
      oa = zt[--jt], zt[jt] = null, Qt = zt[--jt], zt[jt] = null, Gt = zt[--jt], zt[jt] = null;
  }
  function Zs(l, t) {
    zt[jt++] = Gt, zt[jt++] = Qt, zt[jt++] = oa, Gt = t.id, Qt = t.overflow, oa = l;
  }
  var Vl = null, Sl = null, ul = !1, ha = null, _t = !1, Ii = Error(r(519));
  function ma(l) {
    var t = Error(
      r(
        418,
        1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML",
        ""
      )
    );
    throw du(Tt(t, l)), Ii;
  }
  function Vs(l) {
    var t = l.stateNode, a = l.type, e = l.memoizedProps;
    switch (t[Zl] = l, t[et] = e, a) {
      case "dialog":
        ll("cancel", t), ll("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        ll("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < Cu.length; a++)
          ll(Cu[a], t);
        break;
      case "source":
        ll("error", t);
        break;
      case "img":
      case "image":
      case "link":
        ll("error", t), ll("load", t);
        break;
      case "details":
        ll("toggle", t);
        break;
      case "input":
        ll("invalid", t), es(
          t,
          e.value,
          e.defaultValue,
          e.checked,
          e.defaultChecked,
          e.type,
          e.name,
          !0
        );
        break;
      case "select":
        ll("invalid", t);
        break;
      case "textarea":
        ll("invalid", t), ns(t, e.value, e.defaultValue, e.children);
    }
    a = e.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || e.suppressHydrationWarning === !0 || co(t.textContent, a) ? (e.popover != null && (ll("beforetoggle", t), ll("toggle", t)), e.onScroll != null && ll("scroll", t), e.onScrollEnd != null && ll("scrollend", t), e.onClick != null && (t.onclick = Kt), t = !0) : t = !1, t || ma(l, !0);
  }
  function Ks(l) {
    for (Vl = l.return; Vl; )
      switch (Vl.tag) {
        case 5:
        case 31:
        case 13:
          _t = !1;
          return;
        case 27:
        case 3:
          _t = !0;
          return;
        default:
          Vl = Vl.return;
      }
  }
  function ze(l) {
    if (l !== Vl) return !1;
    if (!ul) return Ks(l), ul = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || gf(l.type, l.memoizedProps)), a = !a), a && Sl && ma(l), Ks(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(r(317));
      Sl = go(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(r(317));
      Sl = go(l);
    } else
      t === 27 ? (t = Sl, Oa(l.type) ? (l = Af, Af = null, Sl = l) : Sl = t) : Sl = Vl ? Nt(l.stateNode.nextSibling) : null;
    return !0;
  }
  function ka() {
    Sl = Vl = null, ul = !1;
  }
  function Pi() {
    var l = ha;
    return l !== null && (ft === null ? ft = l : ft.push.apply(
      ft,
      l
    ), ha = null), l;
  }
  function du(l) {
    ha === null ? ha = [l] : ha.push(l);
  }
  var lc = h(null), Fa = null, Ft = null;
  function va(l, t, a) {
    M(lc, t._currentValue), t._currentValue = a;
  }
  function Wt(l) {
    l._currentValue = lc.current, j(lc);
  }
  function tc(l, t, a) {
    for (; l !== null; ) {
      var e = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, e !== null && (e.childLanes |= t)) : e !== null && (e.childLanes & t) !== t && (e.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function ac(l, t, a, e) {
    var u = l.child;
    for (u !== null && (u.return = l); u !== null; ) {
      var n = u.dependencies;
      if (n !== null) {
        var i = u.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var c = n;
          n = u;
          for (var d = 0; d < t.length; d++)
            if (c.context === t[d]) {
              n.lanes |= a, c = n.alternate, c !== null && (c.lanes |= a), tc(
                n.return,
                a,
                l
              ), e || (i = null);
              break l;
            }
          n = c.next;
        }
      } else if (u.tag === 18) {
        if (i = u.return, i === null) throw Error(r(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), tc(i, a, l), i = null;
      } else i = u.child;
      if (i !== null) i.return = u;
      else
        for (i = u; i !== null; ) {
          if (i === l) {
            i = null;
            break;
          }
          if (u = i.sibling, u !== null) {
            u.return = i.return, i = u;
            break;
          }
          i = i.return;
        }
      u = i;
    }
  }
  function je(l, t, a, e) {
    l = null;
    for (var u = t, n = !1; u !== null; ) {
      if (!n) {
        if ((u.flags & 524288) !== 0) n = !0;
        else if ((u.flags & 262144) !== 0) break;
      }
      if (u.tag === 10) {
        var i = u.alternate;
        if (i === null) throw Error(r(387));
        if (i = i.memoizedProps, i !== null) {
          var c = u.type;
          ot(u.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (u === tl.current) {
        if (i = u.alternate, i === null) throw Error(r(387));
        i.memoizedState.memoizedState !== u.memoizedState.memoizedState && (l !== null ? l.push(Yu) : l = [Yu]);
      }
      u = u.return;
    }
    l !== null && ac(
      t,
      l,
      a,
      e
    ), t.flags |= 262144;
  }
  function on(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!ot(
        l.context._currentValue,
        l.memoizedValue
      ))
        return !0;
      l = l.next;
    }
    return !1;
  }
  function Wa(l) {
    Fa = l, Ft = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Kl(l) {
    return Js(Fa, l);
  }
  function hn(l, t) {
    return Fa === null && Wa(l), Js(l, t);
  }
  function Js(l, t) {
    var a = t._currentValue;
    if (t = { context: t, memoizedValue: a, next: null }, Ft === null) {
      if (l === null) throw Error(r(308));
      Ft = t, l.dependencies = { lanes: 0, firstContext: t }, l.flags |= 524288;
    } else Ft = Ft.next = t;
    return a;
  }
  var fm = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(a, e) {
        l.push(e);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(a) {
        return a();
      });
    };
  }, sm = s.unstable_scheduleCallback, rm = s.unstable_NormalPriority, Ml = {
    $$typeof: xl,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function ec() {
    return {
      controller: new fm(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function ou(l) {
    l.refCount--, l.refCount === 0 && sm(rm, function() {
      l.controller.abort();
    });
  }
  var hu = null, uc = 0, _e = 0, Oe = null;
  function dm(l, t) {
    if (hu === null) {
      var a = hu = [];
      uc = 0, _e = ff(), Oe = {
        status: "pending",
        value: void 0,
        then: function(e) {
          a.push(e);
        }
      };
    }
    return uc++, t.then(ws, ws), t;
  }
  function ws() {
    if (--uc === 0 && hu !== null) {
      Oe !== null && (Oe.status = "fulfilled");
      var l = hu;
      hu = null, _e = 0, Oe = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function om(l, t) {
    var a = [], e = {
      status: "pending",
      value: null,
      reason: null,
      then: function(u) {
        a.push(u);
      }
    };
    return l.then(
      function() {
        e.status = "fulfilled", e.value = t;
        for (var u = 0; u < a.length; u++) (0, a[u])(t);
      },
      function(u) {
        for (e.status = "rejected", e.reason = u, u = 0; u < a.length; u++)
          (0, a[u])(void 0);
      }
    ), e;
  }
  var ks = x.S;
  x.S = function(l, t) {
    Md = Il(), typeof t == "object" && t !== null && typeof t.then == "function" && dm(l, t), ks !== null && ks(l, t);
  };
  var $a = h(null);
  function nc() {
    var l = $a.current;
    return l !== null ? l : yl.pooledCache;
  }
  function mn(l, t) {
    t === null ? M($a, $a.current) : M($a, t.pool);
  }
  function Fs() {
    var l = nc();
    return l === null ? null : { parent: Ml._currentValue, pool: l };
  }
  var Ne = Error(r(460)), ic = Error(r(474)), vn = Error(r(542)), yn = { then: function() {
  } };
  function Ws(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function $s(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Kt, Kt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, Ps(l), l;
      default:
        if (typeof t.status == "string") t.then(Kt, Kt);
        else {
          if (l = yl, l !== null && 100 < l.shellSuspendCounter)
            throw Error(r(482));
          l = t, l.status = "pending", l.then(
            function(e) {
              if (t.status === "pending") {
                var u = t;
                u.status = "fulfilled", u.value = e;
              }
            },
            function(e) {
              if (t.status === "pending") {
                var u = t;
                u.status = "rejected", u.reason = e;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, Ps(l), l;
        }
        throw Pa = t, Ne;
    }
  }
  function Ia(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Pa = a, Ne) : a;
    }
  }
  var Pa = null;
  function Is() {
    if (Pa === null) throw Error(r(459));
    var l = Pa;
    return Pa = null, l;
  }
  function Ps(l) {
    if (l === Ne || l === vn)
      throw Error(r(483));
  }
  var Ue = null, mu = 0;
  function gn(l) {
    var t = mu;
    return mu += 1, Ue === null && (Ue = []), $s(Ue, l, t);
  }
  function vu(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function Sn(l, t) {
    throw t.$$typeof === U ? Error(r(525)) : (l = Object.prototype.toString.call(t), Error(
      r(
        31,
        l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l
      )
    ));
  }
  function lr(l) {
    function t(v, o) {
      if (l) {
        var y = v.deletions;
        y === null ? (v.deletions = [o], v.flags |= 16) : y.push(o);
      }
    }
    function a(v, o) {
      if (!l) return null;
      for (; o !== null; )
        t(v, o), o = o.sibling;
      return null;
    }
    function e(v) {
      for (var o = /* @__PURE__ */ new Map(); v !== null; )
        v.key !== null ? o.set(v.key, v) : o.set(v.index, v), v = v.sibling;
      return o;
    }
    function u(v, o) {
      return v = wt(v, o), v.index = 0, v.sibling = null, v;
    }
    function n(v, o, y) {
      return v.index = y, l ? (y = v.alternate, y !== null ? (y = y.index, y < o ? (v.flags |= 67108866, o) : y) : (v.flags |= 67108866, o)) : (v.flags |= 1048576, o);
    }
    function i(v) {
      return l && v.alternate === null && (v.flags |= 67108866), v;
    }
    function c(v, o, y, T) {
      return o === null || o.tag !== 6 ? (o = ki(y, v.mode, T), o.return = v, o) : (o = u(o, y), o.return = v, o);
    }
    function d(v, o, y, T) {
      var Q = y.type;
      return Q === J ? A(
        v,
        o,
        y.props.children,
        T,
        y.key
      ) : o !== null && (o.elementType === Q || typeof Q == "object" && Q !== null && Q.$$typeof === Ul && Ia(Q) === o.type) ? (o = u(o, y.props), vu(o, y), o.return = v, o) : (o = rn(
        y.type,
        y.key,
        y.props,
        null,
        v.mode,
        T
      ), vu(o, y), o.return = v, o);
    }
    function g(v, o, y, T) {
      return o === null || o.tag !== 4 || o.stateNode.containerInfo !== y.containerInfo || o.stateNode.implementation !== y.implementation ? (o = Fi(y, v.mode, T), o.return = v, o) : (o = u(o, y.children || []), o.return = v, o);
    }
    function A(v, o, y, T, Q) {
      return o === null || o.tag !== 7 ? (o = wa(
        y,
        v.mode,
        T,
        Q
      ), o.return = v, o) : (o = u(o, y), o.return = v, o);
    }
    function z(v, o, y) {
      if (typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint")
        return o = ki(
          "" + o,
          v.mode,
          y
        ), o.return = v, o;
      if (typeof o == "object" && o !== null) {
        switch (o.$$typeof) {
          case Y:
            return y = rn(
              o.type,
              o.key,
              o.props,
              null,
              v.mode,
              y
            ), vu(y, o), y.return = v, y;
          case cl:
            return o = Fi(
              o,
              v.mode,
              y
            ), o.return = v, o;
          case Ul:
            return o = Ia(o), z(v, o, y);
        }
        if (dt(o) || Fl(o))
          return o = wa(
            o,
            v.mode,
            y,
            null
          ), o.return = v, o;
        if (typeof o.then == "function")
          return z(v, gn(o), y);
        if (o.$$typeof === xl)
          return z(
            v,
            hn(v, o),
            y
          );
        Sn(v, o);
      }
      return null;
    }
    function S(v, o, y, T) {
      var Q = o !== null ? o.key : null;
      if (typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint")
        return Q !== null ? null : c(v, o, "" + y, T);
      if (typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Y:
            return y.key === Q ? d(v, o, y, T) : null;
          case cl:
            return y.key === Q ? g(v, o, y, T) : null;
          case Ul:
            return y = Ia(y), S(v, o, y, T);
        }
        if (dt(y) || Fl(y))
          return Q !== null ? null : A(v, o, y, T, null);
        if (typeof y.then == "function")
          return S(
            v,
            o,
            gn(y),
            T
          );
        if (y.$$typeof === xl)
          return S(
            v,
            o,
            hn(v, y),
            T
          );
        Sn(v, y);
      }
      return null;
    }
    function b(v, o, y, T, Q) {
      if (typeof T == "string" && T !== "" || typeof T == "number" || typeof T == "bigint")
        return v = v.get(y) || null, c(o, v, "" + T, Q);
      if (typeof T == "object" && T !== null) {
        switch (T.$$typeof) {
          case Y:
            return v = v.get(
              T.key === null ? y : T.key
            ) || null, d(o, v, T, Q);
          case cl:
            return v = v.get(
              T.key === null ? y : T.key
            ) || null, g(o, v, T, Q);
          case Ul:
            return T = Ia(T), b(
              v,
              o,
              y,
              T,
              Q
            );
        }
        if (dt(T) || Fl(T))
          return v = v.get(y) || null, A(o, v, T, Q, null);
        if (typeof T.then == "function")
          return b(
            v,
            o,
            y,
            gn(T),
            Q
          );
        if (T.$$typeof === xl)
          return b(
            v,
            o,
            y,
            hn(o, T),
            Q
          );
        Sn(o, T);
      }
      return null;
    }
    function H(v, o, y, T) {
      for (var Q = null, nl = null, G = o, W = o = 0, el = null; G !== null && W < y.length; W++) {
        G.index > W ? (el = G, G = null) : el = G.sibling;
        var il = S(
          v,
          G,
          y[W],
          T
        );
        if (il === null) {
          G === null && (G = el);
          break;
        }
        l && G && il.alternate === null && t(v, G), o = n(il, o, W), nl === null ? Q = il : nl.sibling = il, nl = il, G = el;
      }
      if (W === y.length)
        return a(v, G), ul && kt(v, W), Q;
      if (G === null) {
        for (; W < y.length; W++)
          G = z(v, y[W], T), G !== null && (o = n(
            G,
            o,
            W
          ), nl === null ? Q = G : nl.sibling = G, nl = G);
        return ul && kt(v, W), Q;
      }
      for (G = e(G); W < y.length; W++)
        el = b(
          G,
          v,
          W,
          y[W],
          T
        ), el !== null && (l && el.alternate !== null && G.delete(
          el.key === null ? W : el.key
        ), o = n(
          el,
          o,
          W
        ), nl === null ? Q = el : nl.sibling = el, nl = el);
      return l && G.forEach(function(Ca) {
        return t(v, Ca);
      }), ul && kt(v, W), Q;
    }
    function Z(v, o, y, T) {
      if (y == null) throw Error(r(151));
      for (var Q = null, nl = null, G = o, W = o = 0, el = null, il = y.next(); G !== null && !il.done; W++, il = y.next()) {
        G.index > W ? (el = G, G = null) : el = G.sibling;
        var Ca = S(v, G, il.value, T);
        if (Ca === null) {
          G === null && (G = el);
          break;
        }
        l && G && Ca.alternate === null && t(v, G), o = n(Ca, o, W), nl === null ? Q = Ca : nl.sibling = Ca, nl = Ca, G = el;
      }
      if (il.done)
        return a(v, G), ul && kt(v, W), Q;
      if (G === null) {
        for (; !il.done; W++, il = y.next())
          il = z(v, il.value, T), il !== null && (o = n(il, o, W), nl === null ? Q = il : nl.sibling = il, nl = il);
        return ul && kt(v, W), Q;
      }
      for (G = e(G); !il.done; W++, il = y.next())
        il = b(G, v, W, il.value, T), il !== null && (l && il.alternate !== null && G.delete(il.key === null ? W : il.key), o = n(il, o, W), nl === null ? Q = il : nl.sibling = il, nl = il);
      return l && G.forEach(function(x0) {
        return t(v, x0);
      }), ul && kt(v, W), Q;
    }
    function vl(v, o, y, T) {
      if (typeof y == "object" && y !== null && y.type === J && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Y:
            l: {
              for (var Q = y.key; o !== null; ) {
                if (o.key === Q) {
                  if (Q = y.type, Q === J) {
                    if (o.tag === 7) {
                      a(
                        v,
                        o.sibling
                      ), T = u(
                        o,
                        y.props.children
                      ), T.return = v, v = T;
                      break l;
                    }
                  } else if (o.elementType === Q || typeof Q == "object" && Q !== null && Q.$$typeof === Ul && Ia(Q) === o.type) {
                    a(
                      v,
                      o.sibling
                    ), T = u(o, y.props), vu(T, y), T.return = v, v = T;
                    break l;
                  }
                  a(v, o);
                  break;
                } else t(v, o);
                o = o.sibling;
              }
              y.type === J ? (T = wa(
                y.props.children,
                v.mode,
                T,
                y.key
              ), T.return = v, v = T) : (T = rn(
                y.type,
                y.key,
                y.props,
                null,
                v.mode,
                T
              ), vu(T, y), T.return = v, v = T);
            }
            return i(v);
          case cl:
            l: {
              for (Q = y.key; o !== null; ) {
                if (o.key === Q)
                  if (o.tag === 4 && o.stateNode.containerInfo === y.containerInfo && o.stateNode.implementation === y.implementation) {
                    a(
                      v,
                      o.sibling
                    ), T = u(o, y.children || []), T.return = v, v = T;
                    break l;
                  } else {
                    a(v, o);
                    break;
                  }
                else t(v, o);
                o = o.sibling;
              }
              T = Fi(y, v.mode, T), T.return = v, v = T;
            }
            return i(v);
          case Ul:
            return y = Ia(y), vl(
              v,
              o,
              y,
              T
            );
        }
        if (dt(y))
          return H(
            v,
            o,
            y,
            T
          );
        if (Fl(y)) {
          if (Q = Fl(y), typeof Q != "function") throw Error(r(150));
          return y = Q.call(y), Z(
            v,
            o,
            y,
            T
          );
        }
        if (typeof y.then == "function")
          return vl(
            v,
            o,
            gn(y),
            T
          );
        if (y.$$typeof === xl)
          return vl(
            v,
            o,
            hn(v, y),
            T
          );
        Sn(v, y);
      }
      return typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint" ? (y = "" + y, o !== null && o.tag === 6 ? (a(v, o.sibling), T = u(o, y), T.return = v, v = T) : (a(v, o), T = ki(y, v.mode, T), T.return = v, v = T), i(v)) : a(v, o);
    }
    return function(v, o, y, T) {
      try {
        mu = 0;
        var Q = vl(
          v,
          o,
          y,
          T
        );
        return Ue = null, Q;
      } catch (G) {
        if (G === Ne || G === vn) throw G;
        var nl = ht(29, G, null, v.mode);
        return nl.lanes = T, nl.return = v, nl;
      }
    };
  }
  var le = lr(!0), tr = lr(!1), ya = !1;
  function cc(l) {
    l.updateQueue = {
      baseState: l.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function fc(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function ga(l) {
    return { lane: l, tag: 0, payload: null, callback: null, next: null };
  }
  function Sa(l, t, a) {
    var e = l.updateQueue;
    if (e === null) return null;
    if (e = e.shared, (fl & 2) !== 0) {
      var u = e.pending;
      return u === null ? t.next = t : (t.next = u.next, u.next = t), e.pending = t, t = sn(l), Ys(l, null, a), t;
    }
    return fn(l, e, t, a), sn(l);
  }
  function yu(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, Jf(l, a);
    }
  }
  function sc(l, t) {
    var a = l.updateQueue, e = l.alternate;
    if (e !== null && (e = e.updateQueue, a === e)) {
      var u = null, n = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          n === null ? u = n = i : n = n.next = i, a = a.next;
        } while (a !== null);
        n === null ? u = n = t : n = n.next = t;
      } else u = n = t;
      a = {
        baseState: e.baseState,
        firstBaseUpdate: u,
        lastBaseUpdate: n,
        shared: e.shared,
        callbacks: e.callbacks
      }, l.updateQueue = a;
      return;
    }
    l = a.lastBaseUpdate, l === null ? a.firstBaseUpdate = t : l.next = t, a.lastBaseUpdate = t;
  }
  var rc = !1;
  function gu() {
    if (rc) {
      var l = Oe;
      if (l !== null) throw l;
    }
  }
  function Su(l, t, a, e) {
    rc = !1;
    var u = l.updateQueue;
    ya = !1;
    var n = u.firstBaseUpdate, i = u.lastBaseUpdate, c = u.shared.pending;
    if (c !== null) {
      u.shared.pending = null;
      var d = c, g = d.next;
      d.next = null, i === null ? n = g : i.next = g, i = d;
      var A = l.alternate;
      A !== null && (A = A.updateQueue, c = A.lastBaseUpdate, c !== i && (c === null ? A.firstBaseUpdate = g : c.next = g, A.lastBaseUpdate = d));
    }
    if (n !== null) {
      var z = u.baseState;
      i = 0, A = g = d = null, c = n;
      do {
        var S = c.lane & -536870913, b = S !== c.lane;
        if (b ? (al & S) === S : (e & S) === S) {
          S !== 0 && S === _e && (rc = !0), A !== null && (A = A.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var H = l, Z = c;
            S = t;
            var vl = a;
            switch (Z.tag) {
              case 1:
                if (H = Z.payload, typeof H == "function") {
                  z = H.call(vl, z, S);
                  break l;
                }
                z = H;
                break l;
              case 3:
                H.flags = H.flags & -65537 | 128;
              case 0:
                if (H = Z.payload, S = typeof H == "function" ? H.call(vl, z, S) : H, S == null) break l;
                z = N({}, z, S);
                break l;
              case 2:
                ya = !0;
            }
          }
          S = c.callback, S !== null && (l.flags |= 64, b && (l.flags |= 8192), b = u.callbacks, b === null ? u.callbacks = [S] : b.push(S));
        } else
          b = {
            lane: S,
            tag: c.tag,
            payload: c.payload,
            callback: c.callback,
            next: null
          }, A === null ? (g = A = b, d = z) : A = A.next = b, i |= S;
        if (c = c.next, c === null) {
          if (c = u.shared.pending, c === null)
            break;
          b = c, c = b.next, b.next = null, u.lastBaseUpdate = b, u.shared.pending = null;
        }
      } while (!0);
      A === null && (d = z), u.baseState = d, u.firstBaseUpdate = g, u.lastBaseUpdate = A, n === null && (u.shared.lanes = 0), xa |= i, l.lanes = i, l.memoizedState = z;
    }
  }
  function ar(l, t) {
    if (typeof l != "function")
      throw Error(r(191, l));
    l.call(t);
  }
  function er(l, t) {
    var a = l.callbacks;
    if (a !== null)
      for (l.callbacks = null, l = 0; l < a.length; l++)
        ar(a[l], t);
  }
  var Me = h(null), bn = h(0);
  function ur(l, t) {
    l = na, M(bn, l), M(Me, t), na = l | t.baseLanes;
  }
  function dc() {
    M(bn, na), M(Me, Me.current);
  }
  function oc() {
    na = bn.current, j(Me), j(bn);
  }
  var mt = h(null), Ot = null;
  function ba(l) {
    var t = l.alternate;
    M(Ol, Ol.current & 1), M(mt, l), Ot === null && (t === null || Me.current !== null || t.memoizedState !== null) && (Ot = l);
  }
  function hc(l) {
    M(Ol, Ol.current), M(mt, l), Ot === null && (Ot = l);
  }
  function nr(l) {
    l.tag === 22 ? (M(Ol, Ol.current), M(mt, l), Ot === null && (Ot = l)) : pa();
  }
  function pa() {
    M(Ol, Ol.current), M(mt, mt.current);
  }
  function vt(l) {
    j(mt), Ot === l && (Ot = null), j(Ol);
  }
  var Ol = h(0);
  function pn(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || pf(a) || Ef(a)))
          return t;
      } else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === l) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === l) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  var $t = 0, F = null, hl = null, Dl = null, En = !1, De = !1, te = !1, An = 0, bu = 0, Ce = null, hm = 0;
  function Tl() {
    throw Error(r(321));
  }
  function mc(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++)
      if (!ot(l[a], t[a])) return !1;
    return !0;
  }
  function vc(l, t, a, e, u, n) {
    return $t = n, F = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, x.H = l === null || l.memoizedState === null ? Lr : Uc, te = !1, n = a(e, u), te = !1, De && (n = cr(
      t,
      a,
      e,
      u
    )), ir(l), n;
  }
  function ir(l) {
    x.H = Au;
    var t = hl !== null && hl.next !== null;
    if ($t = 0, Dl = hl = F = null, En = !1, bu = 0, Ce = null, t) throw Error(r(300));
    l === null || Cl || (l = l.dependencies, l !== null && on(l) && (Cl = !0));
  }
  function cr(l, t, a, e) {
    F = l;
    var u = 0;
    do {
      if (De && (Ce = null), bu = 0, De = !1, 25 <= u) throw Error(r(301));
      if (u += 1, Dl = hl = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      x.H = Zr, n = t(a, e);
    } while (De);
    return n;
  }
  function mm() {
    var l = x.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? pu(t) : t, l = l.useState()[0], (hl !== null ? hl.memoizedState : null) !== l && (F.flags |= 1024), t;
  }
  function yc() {
    var l = An !== 0;
    return An = 0, l;
  }
  function gc(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Sc(l) {
    if (En) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      En = !1;
    }
    $t = 0, Dl = hl = F = null, De = !1, bu = An = 0, Ce = null;
  }
  function Pl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Dl === null ? F.memoizedState = Dl = l : Dl = Dl.next = l, Dl;
  }
  function Nl() {
    if (hl === null) {
      var l = F.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = hl.next;
    var t = Dl === null ? F.memoizedState : Dl.next;
    if (t !== null)
      Dl = t, hl = l;
    else {
      if (l === null)
        throw F.alternate === null ? Error(r(467)) : Error(r(310));
      hl = l, l = {
        memoizedState: hl.memoizedState,
        baseState: hl.baseState,
        baseQueue: hl.baseQueue,
        queue: hl.queue,
        next: null
      }, Dl === null ? F.memoizedState = Dl = l : Dl = Dl.next = l;
    }
    return Dl;
  }
  function xn() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function pu(l) {
    var t = bu;
    return bu += 1, Ce === null && (Ce = []), l = $s(Ce, l, t), t = F, (Dl === null ? t.memoizedState : Dl.next) === null && (t = t.alternate, x.H = t === null || t.memoizedState === null ? Lr : Uc), l;
  }
  function Tn(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return pu(l);
      if (l.$$typeof === xl) return Kl(l);
    }
    throw Error(r(438, String(l)));
  }
  function bc(l) {
    var t = null, a = F.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var e = F.alternate;
      e !== null && (e = e.updateQueue, e !== null && (e = e.memoCache, e != null && (t = {
        data: e.data.map(function(u) {
          return u.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), a === null && (a = xn(), F.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0)
      for (a = t.data[t.index] = Array(l), e = 0; e < l; e++)
        a[e] = fa;
    return t.index++, a;
  }
  function It(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function zn(l) {
    var t = Nl();
    return pc(t, hl, l);
  }
  function pc(l, t, a) {
    var e = l.queue;
    if (e === null) throw Error(r(311));
    e.lastRenderedReducer = a;
    var u = l.baseQueue, n = e.pending;
    if (n !== null) {
      if (u !== null) {
        var i = u.next;
        u.next = n.next, n.next = i;
      }
      t.baseQueue = u = n, e.pending = null;
    }
    if (n = l.baseState, u === null) l.memoizedState = n;
    else {
      t = u.next;
      var c = i = null, d = null, g = t, A = !1;
      do {
        var z = g.lane & -536870913;
        if (z !== g.lane ? (al & z) === z : ($t & z) === z) {
          var S = g.revertLane;
          if (S === 0)
            d !== null && (d = d.next = {
              lane: 0,
              revertLane: 0,
              gesture: null,
              action: g.action,
              hasEagerState: g.hasEagerState,
              eagerState: g.eagerState,
              next: null
            }), z === _e && (A = !0);
          else if (($t & S) === S) {
            g = g.next, S === _e && (A = !0);
            continue;
          } else
            z = {
              lane: 0,
              revertLane: g.revertLane,
              gesture: null,
              action: g.action,
              hasEagerState: g.hasEagerState,
              eagerState: g.eagerState,
              next: null
            }, d === null ? (c = d = z, i = n) : d = d.next = z, F.lanes |= S, xa |= S;
          z = g.action, te && a(n, z), n = g.hasEagerState ? g.eagerState : a(n, z);
        } else
          S = {
            lane: z,
            revertLane: g.revertLane,
            gesture: g.gesture,
            action: g.action,
            hasEagerState: g.hasEagerState,
            eagerState: g.eagerState,
            next: null
          }, d === null ? (c = d = S, i = n) : d = d.next = S, F.lanes |= z, xa |= z;
        g = g.next;
      } while (g !== null && g !== t);
      if (d === null ? i = n : d.next = c, !ot(n, l.memoizedState) && (Cl = !0, A && (a = Oe, a !== null)))
        throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = d, e.lastRenderedState = n;
    }
    return u === null && (e.lanes = 0), [l.memoizedState, e.dispatch];
  }
  function Ec(l) {
    var t = Nl(), a = t.queue;
    if (a === null) throw Error(r(311));
    a.lastRenderedReducer = l;
    var e = a.dispatch, u = a.pending, n = t.memoizedState;
    if (u !== null) {
      a.pending = null;
      var i = u = u.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== u);
      ot(n, t.memoizedState) || (Cl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, e];
  }
  function fr(l, t, a) {
    var e = F, u = Nl(), n = ul;
    if (n) {
      if (a === void 0) throw Error(r(407));
      a = a();
    } else a = t();
    var i = !ot(
      (hl || u).memoizedState,
      a
    );
    if (i && (u.memoizedState = a, Cl = !0), u = u.queue, Tc(dr.bind(null, e, u, l), [
      l
    ]), u.getSnapshot !== t || i || Dl !== null && Dl.memoizedState.tag & 1) {
      if (e.flags |= 2048, Re(
        9,
        { destroy: void 0 },
        rr.bind(
          null,
          e,
          u,
          a,
          t
        ),
        null
      ), yl === null) throw Error(r(349));
      n || ($t & 127) !== 0 || sr(e, t, a);
    }
    return a;
  }
  function sr(l, t, a) {
    l.flags |= 16384, l = { getSnapshot: t, value: a }, t = F.updateQueue, t === null ? (t = xn(), F.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function rr(l, t, a, e) {
    t.value = a, t.getSnapshot = e, or(t) && hr(l);
  }
  function dr(l, t, a) {
    return a(function() {
      or(t) && hr(l);
    });
  }
  function or(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !ot(l, a);
    } catch {
      return !0;
    }
  }
  function hr(l) {
    var t = Ja(l, 2);
    t !== null && st(t, l, 2);
  }
  function Ac(l) {
    var t = Pl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), te) {
        gl(!0);
        try {
          a();
        } finally {
          gl(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: It,
      lastRenderedState: l
    }, t;
  }
  function mr(l, t, a, e) {
    return l.baseState = a, pc(
      l,
      hl,
      typeof e == "function" ? e : It
    );
  }
  function vm(l, t, a, e, u) {
    if (On(l)) throw Error(r(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: u,
        action: l,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(i) {
          n.listeners.push(i);
        }
      };
      x.T !== null ? a(!0) : n.isTransition = !1, e(n), a = t.pending, a === null ? (n.next = t.pending = n, vr(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function vr(l, t) {
    var a = t.action, e = t.payload, u = l.state;
    if (t.isTransition) {
      var n = x.T, i = {};
      x.T = i;
      try {
        var c = a(u, e), d = x.S;
        d !== null && d(i, c), yr(l, t, c);
      } catch (g) {
        xc(l, t, g);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), x.T = n;
      }
    } else
      try {
        n = a(u, e), yr(l, t, n);
      } catch (g) {
        xc(l, t, g);
      }
  }
  function yr(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(
      function(e) {
        gr(l, t, e);
      },
      function(e) {
        return xc(l, t, e);
      }
    ) : gr(l, t, a);
  }
  function gr(l, t, a) {
    t.status = "fulfilled", t.value = a, Sr(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, vr(l, a)));
  }
  function xc(l, t, a) {
    var e = l.pending;
    if (l.pending = null, e !== null) {
      e = e.next;
      do
        t.status = "rejected", t.reason = a, Sr(t), t = t.next;
      while (t !== e);
    }
    l.action = null;
  }
  function Sr(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function br(l, t) {
    return t;
  }
  function pr(l, t) {
    if (ul) {
      var a = yl.formState;
      if (a !== null) {
        l: {
          var e = F;
          if (ul) {
            if (Sl) {
              t: {
                for (var u = Sl, n = _t; u.nodeType !== 8; ) {
                  if (!n) {
                    u = null;
                    break t;
                  }
                  if (u = Nt(
                    u.nextSibling
                  ), u === null) {
                    u = null;
                    break t;
                  }
                }
                n = u.data, u = n === "F!" || n === "F" ? u : null;
              }
              if (u) {
                Sl = Nt(
                  u.nextSibling
                ), e = u.data === "F!";
                break l;
              }
            }
            ma(e);
          }
          e = !1;
        }
        e && (t = a[0]);
      }
    }
    return a = Pl(), a.memoizedState = a.baseState = t, e = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: br,
      lastRenderedState: t
    }, a.queue = e, a = Gr.bind(
      null,
      F,
      e
    ), e.dispatch = a, e = Ac(!1), n = Nc.bind(
      null,
      F,
      !1,
      e.queue
    ), e = Pl(), u = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, e.queue = u, a = vm.bind(
      null,
      F,
      u,
      n,
      a
    ), u.dispatch = a, e.memoizedState = l, [t, a, !1];
  }
  function Er(l) {
    var t = Nl();
    return Ar(t, hl, l);
  }
  function Ar(l, t, a) {
    if (t = pc(
      l,
      t,
      br
    )[0], l = zn(It)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var e = pu(t);
      } catch (i) {
        throw i === Ne ? vn : i;
      }
    else e = t;
    t = Nl();
    var u = t.queue, n = u.dispatch;
    return a !== t.memoizedState && (F.flags |= 2048, Re(
      9,
      { destroy: void 0 },
      ym.bind(null, u, a),
      null
    )), [e, n, l];
  }
  function ym(l, t) {
    l.action = t;
  }
  function xr(l) {
    var t = Nl(), a = hl;
    if (a !== null)
      return Ar(t, a, l);
    Nl(), t = t.memoizedState, a = Nl();
    var e = a.queue.dispatch;
    return a.memoizedState = l, [t, e, !1];
  }
  function Re(l, t, a, e) {
    return l = { tag: l, create: a, deps: e, inst: t, next: null }, t = F.updateQueue, t === null && (t = xn(), F.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (e = a.next, a.next = l, l.next = e, t.lastEffect = l), l;
  }
  function Tr() {
    return Nl().memoizedState;
  }
  function jn(l, t, a, e) {
    var u = Pl();
    F.flags |= l, u.memoizedState = Re(
      1 | t,
      { destroy: void 0 },
      a,
      e === void 0 ? null : e
    );
  }
  function _n(l, t, a, e) {
    var u = Nl();
    e = e === void 0 ? null : e;
    var n = u.memoizedState.inst;
    hl !== null && e !== null && mc(e, hl.memoizedState.deps) ? u.memoizedState = Re(t, n, a, e) : (F.flags |= l, u.memoizedState = Re(
      1 | t,
      n,
      a,
      e
    ));
  }
  function zr(l, t) {
    jn(8390656, 8, l, t);
  }
  function Tc(l, t) {
    _n(2048, 8, l, t);
  }
  function gm(l) {
    F.flags |= 4;
    var t = F.updateQueue;
    if (t === null)
      t = xn(), F.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function jr(l) {
    var t = Nl().memoizedState;
    return gm({ ref: t, nextImpl: l }), function() {
      if ((fl & 2) !== 0) throw Error(r(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function _r(l, t) {
    return _n(4, 2, l, t);
  }
  function Or(l, t) {
    return _n(4, 4, l, t);
  }
  function Nr(l, t) {
    if (typeof t == "function") {
      l = l();
      var a = t(l);
      return function() {
        typeof a == "function" ? a() : t(null);
      };
    }
    if (t != null)
      return l = l(), t.current = l, function() {
        t.current = null;
      };
  }
  function Ur(l, t, a) {
    a = a != null ? a.concat([l]) : null, _n(4, 4, Nr.bind(null, t, l), a);
  }
  function zc() {
  }
  function Mr(l, t) {
    var a = Nl();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    return t !== null && mc(t, e[1]) ? e[0] : (a.memoizedState = [l, t], l);
  }
  function Dr(l, t) {
    var a = Nl();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    if (t !== null && mc(t, e[1]))
      return e[0];
    if (e = l(), te) {
      gl(!0);
      try {
        l();
      } finally {
        gl(!1);
      }
    }
    return a.memoizedState = [e, t], e;
  }
  function jc(l, t, a) {
    return a === void 0 || ($t & 1073741824) !== 0 && (al & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = Cd(), F.lanes |= l, xa |= l, a);
  }
  function Cr(l, t, a, e) {
    return ot(a, t) ? a : Me.current !== null ? (l = jc(l, a, e), ot(l, t) || (Cl = !0), l) : ($t & 42) === 0 || ($t & 1073741824) !== 0 && (al & 261930) === 0 ? (Cl = !0, l.memoizedState = a) : (l = Cd(), F.lanes |= l, xa |= l, t);
  }
  function Rr(l, t, a, e, u) {
    var n = D.p;
    D.p = n !== 0 && 8 > n ? n : 8;
    var i = x.T, c = {};
    x.T = c, Nc(l, !1, t, a);
    try {
      var d = u(), g = x.S;
      if (g !== null && g(c, d), d !== null && typeof d == "object" && typeof d.then == "function") {
        var A = om(
          d,
          e
        );
        Eu(
          l,
          t,
          A,
          St(l)
        );
      } else
        Eu(
          l,
          t,
          e,
          St(l)
        );
    } catch (z) {
      Eu(
        l,
        t,
        { then: function() {
        }, status: "rejected", reason: z },
        St()
      );
    } finally {
      D.p = n, i !== null && c.types !== null && (i.types = c.types), x.T = i;
    }
  }
  function Sm() {
  }
  function _c(l, t, a, e) {
    if (l.tag !== 5) throw Error(r(476));
    var u = Hr(l).queue;
    Rr(
      l,
      u,
      t,
      V,
      a === null ? Sm : function() {
        return Br(l), a(e);
      }
    );
  }
  function Hr(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: V,
      baseState: V,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: It,
        lastRenderedState: V
      },
      next: null
    };
    var a = {};
    return t.next = {
      memoizedState: a,
      baseState: a,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: It,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function Br(l) {
    var t = Hr(l);
    t.next === null && (t = l.alternate.memoizedState), Eu(
      l,
      t.next.queue,
      {},
      St()
    );
  }
  function Oc() {
    return Kl(Yu);
  }
  function qr() {
    return Nl().memoizedState;
  }
  function Yr() {
    return Nl().memoizedState;
  }
  function bm(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = St();
          l = ga(a);
          var e = Sa(t, l, a);
          e !== null && (st(e, t, a), yu(e, t, a)), t = { cache: ec() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function pm(l, t, a) {
    var e = St();
    a = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, On(l) ? Qr(t, a) : (a = Ji(l, t, a, e), a !== null && (st(a, l, e), Xr(a, t, e)));
  }
  function Gr(l, t, a) {
    var e = St();
    Eu(l, t, a, e);
  }
  function Eu(l, t, a, e) {
    var u = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (On(l)) Qr(t, u);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null))
        try {
          var i = t.lastRenderedState, c = n(i, a);
          if (u.hasEagerState = !0, u.eagerState = c, ot(c, i))
            return fn(l, t, u, 0), yl === null && cn(), !1;
        } catch {
        }
      if (a = Ji(l, t, u, e), a !== null)
        return st(a, l, e), Xr(a, t, e), !0;
    }
    return !1;
  }
  function Nc(l, t, a, e) {
    if (e = {
      lane: 2,
      revertLane: ff(),
      gesture: null,
      action: e,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, On(l)) {
      if (t) throw Error(r(479));
    } else
      t = Ji(
        l,
        a,
        e,
        2
      ), t !== null && st(t, l, 2);
  }
  function On(l) {
    var t = l.alternate;
    return l === F || t !== null && t === F;
  }
  function Qr(l, t) {
    De = En = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function Xr(l, t, a) {
    if ((a & 4194048) !== 0) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, Jf(l, a);
    }
  }
  var Au = {
    readContext: Kl,
    use: Tn,
    useCallback: Tl,
    useContext: Tl,
    useEffect: Tl,
    useImperativeHandle: Tl,
    useLayoutEffect: Tl,
    useInsertionEffect: Tl,
    useMemo: Tl,
    useReducer: Tl,
    useRef: Tl,
    useState: Tl,
    useDebugValue: Tl,
    useDeferredValue: Tl,
    useTransition: Tl,
    useSyncExternalStore: Tl,
    useId: Tl,
    useHostTransitionStatus: Tl,
    useFormState: Tl,
    useActionState: Tl,
    useOptimistic: Tl,
    useMemoCache: Tl,
    useCacheRefresh: Tl
  };
  Au.useEffectEvent = Tl;
  var Lr = {
    readContext: Kl,
    use: Tn,
    useCallback: function(l, t) {
      return Pl().memoizedState = [
        l,
        t === void 0 ? null : t
      ], l;
    },
    useContext: Kl,
    useEffect: zr,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, jn(
        4194308,
        4,
        Nr.bind(null, t, l),
        a
      );
    },
    useLayoutEffect: function(l, t) {
      return jn(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      jn(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = Pl();
      t = t === void 0 ? null : t;
      var e = l();
      if (te) {
        gl(!0);
        try {
          l();
        } finally {
          gl(!1);
        }
      }
      return a.memoizedState = [e, t], e;
    },
    useReducer: function(l, t, a) {
      var e = Pl();
      if (a !== void 0) {
        var u = a(t);
        if (te) {
          gl(!0);
          try {
            a(t);
          } finally {
            gl(!1);
          }
        }
      } else u = t;
      return e.memoizedState = e.baseState = u, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: u
      }, e.queue = l, l = l.dispatch = pm.bind(
        null,
        F,
        l
      ), [e.memoizedState, l];
    },
    useRef: function(l) {
      var t = Pl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Ac(l);
      var t = l.queue, a = Gr.bind(null, F, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: zc,
    useDeferredValue: function(l, t) {
      var a = Pl();
      return jc(a, l, t);
    },
    useTransition: function() {
      var l = Ac(!1);
      return l = Rr.bind(
        null,
        F,
        l.queue,
        !0,
        !1
      ), Pl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var e = F, u = Pl();
      if (ul) {
        if (a === void 0)
          throw Error(r(407));
        a = a();
      } else {
        if (a = t(), yl === null)
          throw Error(r(349));
        (al & 127) !== 0 || sr(e, t, a);
      }
      u.memoizedState = a;
      var n = { value: a, getSnapshot: t };
      return u.queue = n, zr(dr.bind(null, e, n, l), [
        l
      ]), e.flags |= 2048, Re(
        9,
        { destroy: void 0 },
        rr.bind(
          null,
          e,
          n,
          a,
          t
        ),
        null
      ), a;
    },
    useId: function() {
      var l = Pl(), t = yl.identifierPrefix;
      if (ul) {
        var a = Qt, e = Gt;
        a = (e & ~(1 << 32 - _l(e) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = An++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else
        a = hm++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: Oc,
    useFormState: pr,
    useActionState: pr,
    useOptimistic: function(l) {
      var t = Pl();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = Nc.bind(
        null,
        F,
        !0,
        a
      ), a.dispatch = t, [l, t];
    },
    useMemoCache: bc,
    useCacheRefresh: function() {
      return Pl().memoizedState = bm.bind(
        null,
        F
      );
    },
    useEffectEvent: function(l) {
      var t = Pl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((fl & 2) !== 0)
          throw Error(r(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, Uc = {
    readContext: Kl,
    use: Tn,
    useCallback: Mr,
    useContext: Kl,
    useEffect: Tc,
    useImperativeHandle: Ur,
    useInsertionEffect: _r,
    useLayoutEffect: Or,
    useMemo: Dr,
    useReducer: zn,
    useRef: Tr,
    useState: function() {
      return zn(It);
    },
    useDebugValue: zc,
    useDeferredValue: function(l, t) {
      var a = Nl();
      return Cr(
        a,
        hl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = zn(It)[0], t = Nl().memoizedState;
      return [
        typeof l == "boolean" ? l : pu(l),
        t
      ];
    },
    useSyncExternalStore: fr,
    useId: qr,
    useHostTransitionStatus: Oc,
    useFormState: Er,
    useActionState: Er,
    useOptimistic: function(l, t) {
      var a = Nl();
      return mr(a, hl, l, t);
    },
    useMemoCache: bc,
    useCacheRefresh: Yr
  };
  Uc.useEffectEvent = jr;
  var Zr = {
    readContext: Kl,
    use: Tn,
    useCallback: Mr,
    useContext: Kl,
    useEffect: Tc,
    useImperativeHandle: Ur,
    useInsertionEffect: _r,
    useLayoutEffect: Or,
    useMemo: Dr,
    useReducer: Ec,
    useRef: Tr,
    useState: function() {
      return Ec(It);
    },
    useDebugValue: zc,
    useDeferredValue: function(l, t) {
      var a = Nl();
      return hl === null ? jc(a, l, t) : Cr(
        a,
        hl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = Ec(It)[0], t = Nl().memoizedState;
      return [
        typeof l == "boolean" ? l : pu(l),
        t
      ];
    },
    useSyncExternalStore: fr,
    useId: qr,
    useHostTransitionStatus: Oc,
    useFormState: xr,
    useActionState: xr,
    useOptimistic: function(l, t) {
      var a = Nl();
      return hl !== null ? mr(a, hl, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: bc,
    useCacheRefresh: Yr
  };
  Zr.useEffectEvent = jr;
  function Mc(l, t, a, e) {
    t = l.memoizedState, a = a(e, t), a = a == null ? t : N({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var Dc = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var e = St(), u = ga(e);
      u.payload = t, a != null && (u.callback = a), t = Sa(l, u, e), t !== null && (st(t, l, e), yu(t, l, e));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var e = St(), u = ga(e);
      u.tag = 1, u.payload = t, a != null && (u.callback = a), t = Sa(l, u, e), t !== null && (st(t, l, e), yu(t, l, e));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = St(), e = ga(a);
      e.tag = 2, t != null && (e.callback = t), t = Sa(l, e, a), t !== null && (st(t, l, a), yu(t, l, a));
    }
  };
  function Vr(l, t, a, e, u, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(e, n, i) : t.prototype && t.prototype.isPureReactComponent ? !fu(a, e) || !fu(u, n) : !0;
  }
  function Kr(l, t, a, e) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, e), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, e), t.state !== l && Dc.enqueueReplaceState(t, t.state, null);
  }
  function ae(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var e in t)
        e !== "ref" && (a[e] = t[e]);
    }
    if (l = l.defaultProps) {
      a === t && (a = N({}, a));
      for (var u in l)
        a[u] === void 0 && (a[u] = l[u]);
    }
    return a;
  }
  function Jr(l) {
    nn(l);
  }
  function wr(l) {
    console.error(l);
  }
  function kr(l) {
    nn(l);
  }
  function Nn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (e) {
      setTimeout(function() {
        throw e;
      });
    }
  }
  function Fr(l, t, a) {
    try {
      var e = l.onCaughtError;
      e(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function Cc(l, t, a) {
    return a = ga(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      Nn(l, t);
    }, a;
  }
  function Wr(l) {
    return l = ga(l), l.tag = 3, l;
  }
  function $r(l, t, a, e) {
    var u = a.type.getDerivedStateFromError;
    if (typeof u == "function") {
      var n = e.value;
      l.payload = function() {
        return u(n);
      }, l.callback = function() {
        Fr(t, a, e);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      Fr(t, a, e), typeof u != "function" && (Ta === null ? Ta = /* @__PURE__ */ new Set([this]) : Ta.add(this));
      var c = e.stack;
      this.componentDidCatch(e.value, {
        componentStack: c !== null ? c : ""
      });
    });
  }
  function Em(l, t, a, e, u) {
    if (a.flags |= 32768, e !== null && typeof e == "object" && typeof e.then == "function") {
      if (t = a.alternate, t !== null && je(
        t,
        a,
        u,
        !0
      ), a = mt.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return Ot === null ? Xn() : a.alternate === null && zl === 0 && (zl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = u, e === yn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([e]) : t.add(e), uf(l, e, u)), !1;
          case 22:
            return a.flags |= 65536, e === yn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([e])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([e]) : a.add(e)), uf(l, e, u)), !1;
        }
        throw Error(r(435, a.tag));
      }
      return uf(l, e, u), Xn(), !1;
    }
    if (ul)
      return t = mt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = u, e !== Ii && (l = Error(r(422), { cause: e }), du(Tt(l, a)))) : (e !== Ii && (t = Error(r(423), {
        cause: e
      }), du(
        Tt(t, a)
      )), l = l.current.alternate, l.flags |= 65536, u &= -u, l.lanes |= u, e = Tt(e, a), u = Cc(
        l.stateNode,
        e,
        u
      ), sc(l, u), zl !== 4 && (zl = 2)), !1;
    var n = Error(r(520), { cause: e });
    if (n = Tt(n, a), Uu === null ? Uu = [n] : Uu.push(n), zl !== 4 && (zl = 2), t === null) return !0;
    e = Tt(e, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = u & -u, a.lanes |= l, l = Cc(a.stateNode, e, l), sc(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (Ta === null || !Ta.has(n))))
            return a.flags |= 65536, u &= -u, a.lanes |= u, u = Wr(u), $r(
              u,
              l,
              a,
              e
            ), sc(a, u), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var Rc = Error(r(461)), Cl = !1;
  function Jl(l, t, a, e) {
    t.child = l === null ? tr(t, null, a, e) : le(
      t,
      l.child,
      a,
      e
    );
  }
  function Ir(l, t, a, e, u) {
    a = a.render;
    var n = t.ref;
    if ("ref" in e) {
      var i = {};
      for (var c in e)
        c !== "ref" && (i[c] = e[c]);
    } else i = e;
    return Wa(t), e = vc(
      l,
      t,
      a,
      i,
      n,
      u
    ), c = yc(), l !== null && !Cl ? (gc(l, t, u), Pt(l, t, u)) : (ul && c && Wi(t), t.flags |= 1, Jl(l, t, e, u), t.child);
  }
  function Pr(l, t, a, e, u) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !wi(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, ld(
        l,
        t,
        n,
        e,
        u
      )) : (l = rn(
        a.type,
        null,
        e,
        t,
        t.mode,
        u
      ), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !Lc(l, u)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : fu, a(i, e) && l.ref === t.ref)
        return Pt(l, t, u);
    }
    return t.flags |= 1, l = wt(n, e), l.ref = t.ref, l.return = t, t.child = l;
  }
  function ld(l, t, a, e, u) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (fu(n, e) && l.ref === t.ref)
        if (Cl = !1, t.pendingProps = e = n, Lc(l, u))
          (l.flags & 131072) !== 0 && (Cl = !0);
        else
          return t.lanes = l.lanes, Pt(l, t, u);
    }
    return Hc(
      l,
      t,
      a,
      e,
      u
    );
  }
  function td(l, t, a, e) {
    var u = e.children, n = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), e.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (n = n !== null ? n.baseLanes | a : a, l !== null) {
          for (e = t.child = l.child, u = 0; e !== null; )
            u = u | e.lanes | e.childLanes, e = e.sibling;
          e = u & ~n;
        } else e = 0, t.child = null;
        return ad(
          l,
          t,
          n,
          a,
          e
        );
      }
      if ((a & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, l !== null && mn(
          t,
          n !== null ? n.cachePool : null
        ), n !== null ? ur(t, n) : dc(), nr(t);
      else
        return e = t.lanes = 536870912, ad(
          l,
          t,
          n !== null ? n.baseLanes | a : a,
          a,
          e
        );
    } else
      n !== null ? (mn(t, n.cachePool), ur(t, n), pa(), t.memoizedState = null) : (l !== null && mn(t, null), dc(), pa());
    return Jl(l, t, u, a), t.child;
  }
  function xu(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function ad(l, t, a, e, u) {
    var n = nc();
    return n = n === null ? null : { parent: Ml._currentValue, pool: n }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && mn(t, null), dc(), nr(t), l !== null && je(l, t, e, !0), t.childLanes = u, null;
  }
  function Un(l, t) {
    return t = Dn(
      { mode: t.mode, children: t.children },
      l.mode
    ), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function ed(l, t, a) {
    return le(t, l.child, null, a), l = Un(t, t.pendingProps), l.flags |= 2, vt(t), t.memoizedState = null, l;
  }
  function Am(l, t, a) {
    var e = t.pendingProps, u = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (ul) {
        if (e.mode === "hidden")
          return l = Un(t, e), t.lanes = 536870912, xu(null, l);
        if (hc(t), (l = Sl) ? (l = yo(
          l,
          _t
        ), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: oa !== null ? { id: Gt, overflow: Qt } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = Qs(l), a.return = t, t.child = a, Vl = t, Sl = null)) : l = null, l === null) throw ma(t);
        return t.lanes = 536870912, null;
      }
      return Un(t, e);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (hc(t), u)
        if (t.flags & 256)
          t.flags &= -257, t = ed(
            l,
            t,
            a
          );
        else if (t.memoizedState !== null)
          t.child = l.child, t.flags |= 128, t = null;
        else throw Error(r(558));
      else if (Cl || je(l, t, a, !1), u = (a & l.childLanes) !== 0, Cl || u) {
        if (e = yl, e !== null && (i = wf(e, a), i !== 0 && i !== n.retryLane))
          throw n.retryLane = i, Ja(l, i), st(e, l, i), Rc;
        Xn(), t = ed(
          l,
          t,
          a
        );
      } else
        l = n.treeContext, Sl = Nt(i.nextSibling), Vl = t, ul = !0, ha = null, _t = !1, l !== null && Zs(t, l), t = Un(t, e), t.flags |= 4096;
      return t;
    }
    return l = wt(l.child, {
      mode: e.mode,
      children: e.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function Mn(l, t) {
    var a = t.ref;
    if (a === null)
      l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object")
        throw Error(r(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function Hc(l, t, a, e, u) {
    return Wa(t), a = vc(
      l,
      t,
      a,
      e,
      void 0,
      u
    ), e = yc(), l !== null && !Cl ? (gc(l, t, u), Pt(l, t, u)) : (ul && e && Wi(t), t.flags |= 1, Jl(l, t, a, u), t.child);
  }
  function ud(l, t, a, e, u, n) {
    return Wa(t), t.updateQueue = null, a = cr(
      t,
      e,
      a,
      u
    ), ir(l), e = yc(), l !== null && !Cl ? (gc(l, t, n), Pt(l, t, n)) : (ul && e && Wi(t), t.flags |= 1, Jl(l, t, a, n), t.child);
  }
  function nd(l, t, a, e, u) {
    if (Wa(t), t.stateNode === null) {
      var n = Ae, i = a.contextType;
      typeof i == "object" && i !== null && (n = Kl(i)), n = new a(e, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = Dc, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = e, n.state = t.memoizedState, n.refs = {}, cc(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Kl(i) : Ae, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (Mc(
        t,
        a,
        i,
        e
      ), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && Dc.enqueueReplaceState(n, n.state, null), Su(t, e, n, u), gu(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !0;
    } else if (l === null) {
      n = t.stateNode;
      var c = t.memoizedProps, d = ae(a, c);
      n.props = d;
      var g = n.context, A = a.contextType;
      i = Ae, typeof A == "object" && A !== null && (i = Kl(A));
      var z = a.getDerivedStateFromProps;
      A = typeof z == "function" || typeof n.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, A || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c || g !== i) && Kr(
        t,
        n,
        e,
        i
      ), ya = !1;
      var S = t.memoizedState;
      n.state = S, Su(t, e, n, u), gu(), g = t.memoizedState, c || S !== g || ya ? (typeof z == "function" && (Mc(
        t,
        a,
        z,
        e
      ), g = t.memoizedState), (d = ya || Vr(
        t,
        a,
        d,
        e,
        S,
        g,
        i
      )) ? (A || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = e, t.memoizedState = g), n.props = e, n.state = g, n.context = i, e = d) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !1);
    } else {
      n = t.stateNode, fc(l, t), i = t.memoizedProps, A = ae(a, i), n.props = A, z = t.pendingProps, S = n.context, g = a.contextType, d = Ae, typeof g == "object" && g !== null && (d = Kl(g)), c = a.getDerivedStateFromProps, (g = typeof c == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== z || S !== d) && Kr(
        t,
        n,
        e,
        d
      ), ya = !1, S = t.memoizedState, n.state = S, Su(t, e, n, u), gu();
      var b = t.memoizedState;
      i !== z || S !== b || ya || l !== null && l.dependencies !== null && on(l.dependencies) ? (typeof c == "function" && (Mc(
        t,
        a,
        c,
        e
      ), b = t.memoizedState), (A = ya || Vr(
        t,
        a,
        A,
        e,
        S,
        b,
        d
      ) || l !== null && l.dependencies !== null && on(l.dependencies)) ? (g || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(e, b, d), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(
        e,
        b,
        d
      )), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && S === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && S === l.memoizedState || (t.flags |= 1024), t.memoizedProps = e, t.memoizedState = b), n.props = e, n.state = b, n.context = d, e = A) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && S === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && S === l.memoizedState || (t.flags |= 1024), e = !1);
    }
    return n = e, Mn(l, t), e = (t.flags & 128) !== 0, n || e ? (n = t.stateNode, a = e && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && e ? (t.child = le(
      t,
      l.child,
      null,
      u
    ), t.child = le(
      t,
      null,
      a,
      u
    )) : Jl(l, t, a, u), t.memoizedState = n.state, l = t.child) : l = Pt(
      l,
      t,
      u
    ), l;
  }
  function id(l, t, a, e) {
    return ka(), t.flags |= 256, Jl(l, t, a, e), t.child;
  }
  var Bc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function qc(l) {
    return { baseLanes: l, cachePool: Fs() };
  }
  function Yc(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= gt), l;
  }
  function cd(l, t, a) {
    var e = t.pendingProps, u = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (Ol.current & 2) !== 0), i && (u = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (ul) {
        if (u ? ba(t) : pa(), (l = Sl) ? (l = yo(
          l,
          _t
        ), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: oa !== null ? { id: Gt, overflow: Qt } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = Qs(l), a.return = t, t.child = a, Vl = t, Sl = null)) : l = null, l === null) throw ma(t);
        return Ef(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = e.children;
      return e = e.fallback, u ? (pa(), u = t.mode, c = Dn(
        { mode: "hidden", children: c },
        u
      ), e = wa(
        e,
        u,
        a,
        null
      ), c.return = t, e.return = t, c.sibling = e, t.child = c, e = t.child, e.memoizedState = qc(a), e.childLanes = Yc(
        l,
        i,
        a
      ), t.memoizedState = Bc, xu(null, e)) : (ba(t), Gc(t, c));
    }
    var d = l.memoizedState;
    if (d !== null && (c = d.dehydrated, c !== null)) {
      if (n)
        t.flags & 256 ? (ba(t), t.flags &= -257, t = Qc(
          l,
          t,
          a
        )) : t.memoizedState !== null ? (pa(), t.child = l.child, t.flags |= 128, t = null) : (pa(), c = e.fallback, u = t.mode, e = Dn(
          { mode: "visible", children: e.children },
          u
        ), c = wa(
          c,
          u,
          a,
          null
        ), c.flags |= 2, e.return = t, c.return = t, e.sibling = c, t.child = e, le(
          t,
          l.child,
          null,
          a
        ), e = t.child, e.memoizedState = qc(a), e.childLanes = Yc(
          l,
          i,
          a
        ), t.memoizedState = Bc, t = xu(null, e));
      else if (ba(t), Ef(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var g = i.dgst;
        i = g, e = Error(r(419)), e.stack = "", e.digest = i, du({ value: e, source: null, stack: null }), t = Qc(
          l,
          t,
          a
        );
      } else if (Cl || je(l, t, a, !1), i = (a & l.childLanes) !== 0, Cl || i) {
        if (i = yl, i !== null && (e = wf(i, a), e !== 0 && e !== d.retryLane))
          throw d.retryLane = e, Ja(l, e), st(i, l, e), Rc;
        pf(c) || Xn(), t = Qc(
          l,
          t,
          a
        );
      } else
        pf(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = d.treeContext, Sl = Nt(
          c.nextSibling
        ), Vl = t, ul = !0, ha = null, _t = !1, l !== null && Zs(t, l), t = Gc(
          t,
          e.children
        ), t.flags |= 4096);
      return t;
    }
    return u ? (pa(), c = e.fallback, u = t.mode, d = l.child, g = d.sibling, e = wt(d, {
      mode: "hidden",
      children: e.children
    }), e.subtreeFlags = d.subtreeFlags & 65011712, g !== null ? c = wt(
      g,
      c
    ) : (c = wa(
      c,
      u,
      a,
      null
    ), c.flags |= 2), c.return = t, e.return = t, e.sibling = c, t.child = e, xu(null, e), e = t.child, c = l.child.memoizedState, c === null ? c = qc(a) : (u = c.cachePool, u !== null ? (d = Ml._currentValue, u = u.parent !== d ? { parent: d, pool: d } : u) : u = Fs(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: u
    }), e.memoizedState = c, e.childLanes = Yc(
      l,
      i,
      a
    ), t.memoizedState = Bc, xu(l.child, e)) : (ba(t), a = l.child, l = a.sibling, a = wt(a, {
      mode: "visible",
      children: e.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function Gc(l, t) {
    return t = Dn(
      { mode: "visible", children: t },
      l.mode
    ), t.return = l, l.child = t;
  }
  function Dn(l, t) {
    return l = ht(22, l, null, t), l.lanes = 0, l;
  }
  function Qc(l, t, a) {
    return le(t, l.child, null, a), l = Gc(
      t,
      t.pendingProps.children
    ), l.flags |= 2, t.memoizedState = null, l;
  }
  function fd(l, t, a) {
    l.lanes |= t;
    var e = l.alternate;
    e !== null && (e.lanes |= t), tc(l.return, t, a);
  }
  function Xc(l, t, a, e, u, n) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: e,
      tail: a,
      tailMode: u,
      treeForkCount: n
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = e, i.tail = a, i.tailMode = u, i.treeForkCount = n);
  }
  function sd(l, t, a) {
    var e = t.pendingProps, u = e.revealOrder, n = e.tail;
    e = e.children;
    var i = Ol.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, M(Ol, i), Jl(l, t, e, a), e = ul ? ru : 0, !c && l !== null && (l.flags & 128) !== 0)
      l: for (l = t.child; l !== null; ) {
        if (l.tag === 13)
          l.memoizedState !== null && fd(l, a, t);
        else if (l.tag === 19)
          fd(l, a, t);
        else if (l.child !== null) {
          l.child.return = l, l = l.child;
          continue;
        }
        if (l === t) break l;
        for (; l.sibling === null; ) {
          if (l.return === null || l.return === t)
            break l;
          l = l.return;
        }
        l.sibling.return = l.return, l = l.sibling;
      }
    switch (u) {
      case "forwards":
        for (a = t.child, u = null; a !== null; )
          l = a.alternate, l !== null && pn(l) === null && (u = a), a = a.sibling;
        a = u, a === null ? (u = t.child, t.child = null) : (u = a.sibling, a.sibling = null), Xc(
          t,
          !1,
          u,
          a,
          n,
          e
        );
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, u = t.child, t.child = null; u !== null; ) {
          if (l = u.alternate, l !== null && pn(l) === null) {
            t.child = u;
            break;
          }
          l = u.sibling, u.sibling = a, a = u, u = l;
        }
        Xc(
          t,
          !0,
          a,
          null,
          n,
          e
        );
        break;
      case "together":
        Xc(
          t,
          !1,
          null,
          null,
          void 0,
          e
        );
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Pt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), xa |= t.lanes, (a & t.childLanes) === 0)
      if (l !== null) {
        if (je(
          l,
          t,
          a,
          !1
        ), (a & t.childLanes) === 0)
          return null;
      } else return null;
    if (l !== null && t.child !== l.child)
      throw Error(r(153));
    if (t.child !== null) {
      for (l = t.child, a = wt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; )
        l = l.sibling, a = a.sibling = wt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function Lc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && on(l)));
  }
  function xm(l, t, a) {
    switch (t.tag) {
      case 3:
        Yl(t, t.stateNode.containerInfo), va(t, Ml, l.memoizedState.cache), ka();
        break;
      case 27:
      case 5:
        qa(t);
        break;
      case 4:
        Yl(t, t.stateNode.containerInfo);
        break;
      case 10:
        va(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 31:
        if (t.memoizedState !== null)
          return t.flags |= 128, hc(t), null;
        break;
      case 13:
        var e = t.memoizedState;
        if (e !== null)
          return e.dehydrated !== null ? (ba(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? cd(l, t, a) : (ba(t), l = Pt(
            l,
            t,
            a
          ), l !== null ? l.sibling : null);
        ba(t);
        break;
      case 19:
        var u = (l.flags & 128) !== 0;
        if (e = (a & t.childLanes) !== 0, e || (je(
          l,
          t,
          a,
          !1
        ), e = (a & t.childLanes) !== 0), u) {
          if (e)
            return sd(
              l,
              t,
              a
            );
          t.flags |= 128;
        }
        if (u = t.memoizedState, u !== null && (u.rendering = null, u.tail = null, u.lastEffect = null), M(Ol, Ol.current), e) break;
        return null;
      case 22:
        return t.lanes = 0, td(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        va(t, Ml, l.memoizedState.cache);
    }
    return Pt(l, t, a);
  }
  function rd(l, t, a) {
    if (l !== null)
      if (l.memoizedProps !== t.pendingProps)
        Cl = !0;
      else {
        if (!Lc(l, a) && (t.flags & 128) === 0)
          return Cl = !1, xm(
            l,
            t,
            a
          );
        Cl = (l.flags & 131072) !== 0;
      }
    else
      Cl = !1, ul && (t.flags & 1048576) !== 0 && Ls(t, ru, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var e = t.pendingProps;
          if (l = Ia(t.elementType), t.type = l, typeof l == "function")
            wi(l) ? (e = ae(l, e), t.tag = 1, t = nd(
              null,
              t,
              l,
              e,
              a
            )) : (t.tag = 0, t = Hc(
              null,
              t,
              l,
              e,
              a
            ));
          else {
            if (l != null) {
              var u = l.$$typeof;
              if (u === Ll) {
                t.tag = 11, t = Ir(
                  null,
                  t,
                  l,
                  e,
                  a
                );
                break l;
              } else if (u === k) {
                t.tag = 14, t = Pr(
                  null,
                  t,
                  l,
                  e,
                  a
                );
                break l;
              }
            }
            throw t = bt(l) || l, Error(r(306, t, ""));
          }
        }
        return t;
      case 0:
        return Hc(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 1:
        return e = t.type, u = ae(
          e,
          t.pendingProps
        ), nd(
          l,
          t,
          e,
          u,
          a
        );
      case 3:
        l: {
          if (Yl(
            t,
            t.stateNode.containerInfo
          ), l === null) throw Error(r(387));
          e = t.pendingProps;
          var n = t.memoizedState;
          u = n.element, fc(l, t), Su(t, e, null, a);
          var i = t.memoizedState;
          if (e = i.cache, va(t, Ml, e), e !== n.cache && ac(
            t,
            [Ml],
            a,
            !0
          ), gu(), e = i.element, n.isDehydrated)
            if (n = {
              element: e,
              isDehydrated: !1,
              cache: i.cache
            }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
              t = id(
                l,
                t,
                e,
                a
              );
              break l;
            } else if (e !== u) {
              u = Tt(
                Error(r(424)),
                t
              ), du(u), t = id(
                l,
                t,
                e,
                a
              );
              break l;
            } else
              for (l = t.stateNode.containerInfo, l.nodeType === 9 ? l = l.body : l = l.nodeName === "HTML" ? l.ownerDocument.body : l, Sl = Nt(l.firstChild), Vl = t, ul = !0, ha = null, _t = !0, a = tr(
                t,
                null,
                e,
                a
              ), t.child = a; a; )
                a.flags = a.flags & -3 | 4096, a = a.sibling;
          else {
            if (ka(), e === u) {
              t = Pt(
                l,
                t,
                a
              );
              break l;
            }
            Jl(l, t, e, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return Mn(l, t), l === null ? (a = Ao(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = a : ul || (a = t.type, l = t.pendingProps, e = kn(
          $.current
        ).createElement(a), e[Zl] = t, e[et] = l, wl(e, a, l), Gl(e), t.stateNode = e) : t.memoizedState = Ao(
          t.type,
          l.memoizedProps,
          t.pendingProps,
          l.memoizedState
        ), null;
      case 27:
        return qa(t), l === null && ul && (e = t.stateNode = bo(
          t.type,
          t.pendingProps,
          $.current
        ), Vl = t, _t = !0, u = Sl, Oa(t.type) ? (Af = u, Sl = Nt(e.firstChild)) : Sl = u), Jl(
          l,
          t,
          t.pendingProps.children,
          a
        ), Mn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && ul && ((u = e = Sl) && (e = Pm(
          e,
          t.type,
          t.pendingProps,
          _t
        ), e !== null ? (t.stateNode = e, Vl = t, Sl = Nt(e.firstChild), _t = !1, u = !0) : u = !1), u || ma(t)), qa(t), u = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, e = n.children, gf(u, n) ? e = null : i !== null && gf(u, i) && (t.flags |= 32), t.memoizedState !== null && (u = vc(
          l,
          t,
          mm,
          null,
          null,
          a
        ), Yu._currentValue = u), Mn(l, t), Jl(l, t, e, a), t.child;
      case 6:
        return l === null && ul && ((l = a = Sl) && (a = l0(
          a,
          t.pendingProps,
          _t
        ), a !== null ? (t.stateNode = a, Vl = t, Sl = null, l = !0) : l = !1), l || ma(t)), null;
      case 13:
        return cd(l, t, a);
      case 4:
        return Yl(
          t,
          t.stateNode.containerInfo
        ), e = t.pendingProps, l === null ? t.child = le(
          t,
          null,
          e,
          a
        ) : Jl(l, t, e, a), t.child;
      case 11:
        return Ir(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 7:
        return Jl(
          l,
          t,
          t.pendingProps,
          a
        ), t.child;
      case 8:
        return Jl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 12:
        return Jl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 10:
        return e = t.pendingProps, va(t, t.type, e.value), Jl(l, t, e.children, a), t.child;
      case 9:
        return u = t.type._context, e = t.pendingProps.children, Wa(t), u = Kl(u), e = e(u), t.flags |= 1, Jl(l, t, e, a), t.child;
      case 14:
        return Pr(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 15:
        return ld(
          l,
          t,
          t.type,
          t.pendingProps,
          a
        );
      case 19:
        return sd(l, t, a);
      case 31:
        return Am(l, t, a);
      case 22:
        return td(
          l,
          t,
          a,
          t.pendingProps
        );
      case 24:
        return Wa(t), e = Kl(Ml), l === null ? (u = nc(), u === null && (u = yl, n = ec(), u.pooledCache = n, n.refCount++, n !== null && (u.pooledCacheLanes |= a), u = n), t.memoizedState = { parent: e, cache: u }, cc(t), va(t, Ml, u)) : ((l.lanes & a) !== 0 && (fc(l, t), Su(t, null, null, a), gu()), u = l.memoizedState, n = t.memoizedState, u.parent !== e ? (u = { parent: e, cache: e }, t.memoizedState = u, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = u), va(t, Ml, e)) : (e = n.cache, va(t, Ml, e), e !== u.cache && ac(
          t,
          [Ml],
          a,
          !0
        ))), Jl(
          l,
          t,
          t.pendingProps.children,
          a
        ), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(r(156, t.tag));
  }
  function la(l) {
    l.flags |= 4;
  }
  function Zc(l, t, a, e, u) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (u & 335544128) === u)
        if (l.stateNode.complete) l.flags |= 8192;
        else if (qd()) l.flags |= 8192;
        else
          throw Pa = yn, ic;
    } else l.flags &= -16777217;
  }
  function dd(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      l.flags &= -16777217;
    else if (l.flags |= 16777216, !_o(t))
      if (qd()) l.flags |= 8192;
      else
        throw Pa = yn, ic;
  }
  function Cn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? Vf() : 536870912, l.lanes |= t, Ye |= t);
  }
  function Tu(l, t) {
    if (!ul)
      switch (l.tailMode) {
        case "hidden":
          t = l.tail;
          for (var a = null; t !== null; )
            t.alternate !== null && (a = t), t = t.sibling;
          a === null ? l.tail = null : a.sibling = null;
          break;
        case "collapsed":
          a = l.tail;
          for (var e = null; a !== null; )
            a.alternate !== null && (e = a), a = a.sibling;
          e === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : e.sibling = null;
      }
  }
  function bl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, e = 0;
    if (t)
      for (var u = l.child; u !== null; )
        a |= u.lanes | u.childLanes, e |= u.subtreeFlags & 65011712, e |= u.flags & 65011712, u.return = l, u = u.sibling;
    else
      for (u = l.child; u !== null; )
        a |= u.lanes | u.childLanes, e |= u.subtreeFlags, e |= u.flags, u.return = l, u = u.sibling;
    return l.subtreeFlags |= e, l.childLanes = a, t;
  }
  function Tm(l, t, a) {
    var e = t.pendingProps;
    switch ($i(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return bl(t), null;
      case 1:
        return bl(t), null;
      case 3:
        return a = t.stateNode, e = null, l !== null && (e = l.memoizedState.cache), t.memoizedState.cache !== e && (t.flags |= 2048), Wt(Ml), Al(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (ze(t) ? la(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Pi())), bl(t), null;
      case 26:
        var u = t.type, n = t.memoizedState;
        return l === null ? (la(t), n !== null ? (bl(t), dd(t, n)) : (bl(t), Zc(
          t,
          u,
          null,
          e,
          a
        ))) : n ? n !== l.memoizedState ? (la(t), bl(t), dd(t, n)) : (bl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== e && la(t), bl(t), Zc(
          t,
          u,
          l,
          e,
          a
        )), null;
      case 27:
        if (Ya(t), a = $.current, u = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== e && la(t);
        else {
          if (!e) {
            if (t.stateNode === null)
              throw Error(r(166));
            return bl(t), null;
          }
          l = q.current, ze(t) ? Vs(t) : (l = bo(u, e, a), t.stateNode = l, la(t));
        }
        return bl(t), null;
      case 5:
        if (Ya(t), u = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== e && la(t);
        else {
          if (!e) {
            if (t.stateNode === null)
              throw Error(r(166));
            return bl(t), null;
          }
          if (n = q.current, ze(t))
            Vs(t);
          else {
            var i = kn(
              $.current
            );
            switch (n) {
              case 1:
                n = i.createElementNS(
                  "http://www.w3.org/2000/svg",
                  u
                );
                break;
              case 2:
                n = i.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  u
                );
                break;
              default:
                switch (u) {
                  case "svg":
                    n = i.createElementNS(
                      "http://www.w3.org/2000/svg",
                      u
                    );
                    break;
                  case "math":
                    n = i.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      u
                    );
                    break;
                  case "script":
                    n = i.createElement("div"), n.innerHTML = "<script><\/script>", n = n.removeChild(
                      n.firstChild
                    );
                    break;
                  case "select":
                    n = typeof e.is == "string" ? i.createElement("select", {
                      is: e.is
                    }) : i.createElement("select"), e.multiple ? n.multiple = !0 : e.size && (n.size = e.size);
                    break;
                  default:
                    n = typeof e.is == "string" ? i.createElement(u, { is: e.is }) : i.createElement(u);
                }
            }
            n[Zl] = t, n[et] = e;
            l: for (i = t.child; i !== null; ) {
              if (i.tag === 5 || i.tag === 6)
                n.appendChild(i.stateNode);
              else if (i.tag !== 4 && i.tag !== 27 && i.child !== null) {
                i.child.return = i, i = i.child;
                continue;
              }
              if (i === t) break l;
              for (; i.sibling === null; ) {
                if (i.return === null || i.return === t)
                  break l;
                i = i.return;
              }
              i.sibling.return = i.return, i = i.sibling;
            }
            t.stateNode = n;
            l: switch (wl(n, u, e), u) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                e = !!e.autoFocus;
                break l;
              case "img":
                e = !0;
                break l;
              default:
                e = !1;
            }
            e && la(t);
          }
        }
        return bl(t), Zc(
          t,
          t.type,
          l === null ? null : l.memoizedProps,
          t.pendingProps,
          a
        ), null;
      case 6:
        if (l && t.stateNode != null)
          l.memoizedProps !== e && la(t);
        else {
          if (typeof e != "string" && t.stateNode === null)
            throw Error(r(166));
          if (l = $.current, ze(t)) {
            if (l = t.stateNode, a = t.memoizedProps, e = null, u = Vl, u !== null)
              switch (u.tag) {
                case 27:
                case 5:
                  e = u.memoizedProps;
              }
            l[Zl] = t, l = !!(l.nodeValue === a || e !== null && e.suppressHydrationWarning === !0 || co(l.nodeValue, a)), l || ma(t, !0);
          } else
            l = kn(l).createTextNode(
              e
            ), l[Zl] = t, t.stateNode = l;
        }
        return bl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (e = ze(t), a !== null) {
            if (l === null) {
              if (!e) throw Error(r(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(r(557));
              l[Zl] = t;
            } else
              ka(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            bl(t), l = !1;
          } else
            a = Pi(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
          if ((t.flags & 128) !== 0)
            throw Error(r(558));
        }
        return bl(t), null;
      case 13:
        if (e = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (u = ze(t), e !== null && e.dehydrated !== null) {
            if (l === null) {
              if (!u) throw Error(r(318));
              if (u = t.memoizedState, u = u !== null ? u.dehydrated : null, !u) throw Error(r(317));
              u[Zl] = t;
            } else
              ka(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            bl(t), u = !1;
          } else
            u = Pi(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = u), u = !0;
          if (!u)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
        }
        return vt(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = e !== null, l = l !== null && l.memoizedState !== null, a && (e = t.child, u = null, e.alternate !== null && e.alternate.memoizedState !== null && e.alternate.memoizedState.cachePool !== null && (u = e.alternate.memoizedState.cachePool.pool), n = null, e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), n !== u && (e.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), Cn(t, t.updateQueue), bl(t), null);
      case 4:
        return Al(), l === null && of(t.stateNode.containerInfo), bl(t), null;
      case 10:
        return Wt(t.type), bl(t), null;
      case 19:
        if (j(Ol), e = t.memoizedState, e === null) return bl(t), null;
        if (u = (t.flags & 128) !== 0, n = e.rendering, n === null)
          if (u) Tu(e, !1);
          else {
            if (zl !== 0 || l !== null && (l.flags & 128) !== 0)
              for (l = t.child; l !== null; ) {
                if (n = pn(l), n !== null) {
                  for (t.flags |= 128, Tu(e, !1), l = n.updateQueue, t.updateQueue = l, Cn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; )
                    Gs(a, l), a = a.sibling;
                  return M(
                    Ol,
                    Ol.current & 1 | 2
                  ), ul && kt(t, e.treeForkCount), t.child;
                }
                l = l.sibling;
              }
            e.tail !== null && Il() > Yn && (t.flags |= 128, u = !0, Tu(e, !1), t.lanes = 4194304);
          }
        else {
          if (!u)
            if (l = pn(n), l !== null) {
              if (t.flags |= 128, u = !0, l = l.updateQueue, t.updateQueue = l, Cn(t, l), Tu(e, !0), e.tail === null && e.tailMode === "hidden" && !n.alternate && !ul)
                return bl(t), null;
            } else
              2 * Il() - e.renderingStartTime > Yn && a !== 536870912 && (t.flags |= 128, u = !0, Tu(e, !1), t.lanes = 4194304);
          e.isBackwards ? (n.sibling = t.child, t.child = n) : (l = e.last, l !== null ? l.sibling = n : t.child = n, e.last = n);
        }
        return e.tail !== null ? (l = e.tail, e.rendering = l, e.tail = l.sibling, e.renderingStartTime = Il(), l.sibling = null, a = Ol.current, M(
          Ol,
          u ? a & 1 | 2 : a & 1
        ), ul && kt(t, e.treeForkCount), l) : (bl(t), null);
      case 22:
      case 23:
        return vt(t), oc(), e = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== e && (t.flags |= 8192) : e && (t.flags |= 8192), e ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (bl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : bl(t), a = t.updateQueue, a !== null && Cn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== a && (t.flags |= 2048), l !== null && j($a), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Wt(Ml), bl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(r(156, t.tag));
  }
  function zm(l, t) {
    switch ($i(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Wt(Ml), Al(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return Ya(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (vt(t), t.alternate === null)
            throw Error(r(340));
          ka();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (vt(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(r(340));
          ka();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return j(Ol), null;
      case 4:
        return Al(), null;
      case 10:
        return Wt(t.type), null;
      case 22:
      case 23:
        return vt(t), oc(), l !== null && j($a), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Wt(Ml), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function od(l, t) {
    switch ($i(t), t.tag) {
      case 3:
        Wt(Ml), Al();
        break;
      case 26:
      case 27:
      case 5:
        Ya(t);
        break;
      case 4:
        Al();
        break;
      case 31:
        t.memoizedState !== null && vt(t);
        break;
      case 13:
        vt(t);
        break;
      case 19:
        j(Ol);
        break;
      case 10:
        Wt(t.type);
        break;
      case 22:
      case 23:
        vt(t), oc(), l !== null && j($a);
        break;
      case 24:
        Wt(Ml);
    }
  }
  function zu(l, t) {
    try {
      var a = t.updateQueue, e = a !== null ? a.lastEffect : null;
      if (e !== null) {
        var u = e.next;
        a = u;
        do {
          if ((a.tag & l) === l) {
            e = void 0;
            var n = a.create, i = a.inst;
            e = n(), i.destroy = e;
          }
          a = a.next;
        } while (a !== u);
      }
    } catch (c) {
      ol(t, t.return, c);
    }
  }
  function Ea(l, t, a) {
    try {
      var e = t.updateQueue, u = e !== null ? e.lastEffect : null;
      if (u !== null) {
        var n = u.next;
        e = n;
        do {
          if ((e.tag & l) === l) {
            var i = e.inst, c = i.destroy;
            if (c !== void 0) {
              i.destroy = void 0, u = t;
              var d = a, g = c;
              try {
                g();
              } catch (A) {
                ol(
                  u,
                  d,
                  A
                );
              }
            }
          }
          e = e.next;
        } while (e !== n);
      }
    } catch (A) {
      ol(t, t.return, A);
    }
  }
  function hd(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        er(t, a);
      } catch (e) {
        ol(l, l.return, e);
      }
    }
  }
  function md(l, t, a) {
    a.props = ae(
      l.type,
      l.memoizedProps
    ), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (e) {
      ol(l, t, e);
    }
  }
  function ju(l, t) {
    try {
      var a = l.ref;
      if (a !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var e = l.stateNode;
            break;
          case 30:
            e = l.stateNode;
            break;
          default:
            e = l.stateNode;
        }
        typeof a == "function" ? l.refCleanup = a(e) : a.current = e;
      }
    } catch (u) {
      ol(l, t, u);
    }
  }
  function Xt(l, t) {
    var a = l.ref, e = l.refCleanup;
    if (a !== null)
      if (typeof e == "function")
        try {
          e();
        } catch (u) {
          ol(l, t, u);
        } finally {
          l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
        }
      else if (typeof a == "function")
        try {
          a(null);
        } catch (u) {
          ol(l, t, u);
        }
      else a.current = null;
  }
  function vd(l) {
    var t = l.type, a = l.memoizedProps, e = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          a.autoFocus && e.focus();
          break l;
        case "img":
          a.src ? e.src = a.src : a.srcSet && (e.srcset = a.srcSet);
      }
    } catch (u) {
      ol(l, l.return, u);
    }
  }
  function Vc(l, t, a) {
    try {
      var e = l.stateNode;
      wm(e, l.type, a, t), e[et] = t;
    } catch (u) {
      ol(l, l.return, u);
    }
  }
  function yd(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && Oa(l.type) || l.tag === 4;
  }
  function Kc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || yd(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && Oa(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function Jc(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6)
      l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Kt));
    else if (e !== 4 && (e === 27 && Oa(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null))
      for (Jc(l, t, a), l = l.sibling; l !== null; )
        Jc(l, t, a), l = l.sibling;
  }
  function Rn(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6)
      l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (e !== 4 && (e === 27 && Oa(l.type) && (a = l.stateNode), l = l.child, l !== null))
      for (Rn(l, t, a), l = l.sibling; l !== null; )
        Rn(l, t, a), l = l.sibling;
  }
  function gd(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var e = l.type, u = t.attributes; u.length; )
        t.removeAttributeNode(u[0]);
      wl(t, e, a), t[Zl] = l, t[et] = a;
    } catch (n) {
      ol(l, l.return, n);
    }
  }
  var ta = !1, Rl = !1, wc = !1, Sd = typeof WeakSet == "function" ? WeakSet : Set, Ql = null;
  function jm(l, t) {
    if (l = l.containerInfo, vf = ti, l = Us(l), Qi(l)) {
      if ("selectionStart" in l)
        var a = {
          start: l.selectionStart,
          end: l.selectionEnd
        };
      else
        l: {
          a = (a = l.ownerDocument) && a.defaultView || window;
          var e = a.getSelection && a.getSelection();
          if (e && e.rangeCount !== 0) {
            a = e.anchorNode;
            var u = e.anchorOffset, n = e.focusNode;
            e = e.focusOffset;
            try {
              a.nodeType, n.nodeType;
            } catch {
              a = null;
              break l;
            }
            var i = 0, c = -1, d = -1, g = 0, A = 0, z = l, S = null;
            t: for (; ; ) {
              for (var b; z !== a || u !== 0 && z.nodeType !== 3 || (c = i + u), z !== n || e !== 0 && z.nodeType !== 3 || (d = i + e), z.nodeType === 3 && (i += z.nodeValue.length), (b = z.firstChild) !== null; )
                S = z, z = b;
              for (; ; ) {
                if (z === l) break t;
                if (S === a && ++g === u && (c = i), S === n && ++A === e && (d = i), (b = z.nextSibling) !== null) break;
                z = S, S = z.parentNode;
              }
              z = b;
            }
            a = c === -1 || d === -1 ? null : { start: c, end: d };
          } else a = null;
        }
      a = a || { start: 0, end: 0 };
    } else a = null;
    for (yf = { focusedElem: l, selectionRange: a }, ti = !1, Ql = t; Ql !== null; )
      if (t = Ql, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null)
        l.return = t, Ql = l;
      else
        for (; Ql !== null; ) {
          switch (t = Ql, n = t.alternate, l = t.flags, t.tag) {
            case 0:
              if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null))
                for (a = 0; a < l.length; a++)
                  u = l[a], u.ref.impl = u.nextImpl;
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((l & 1024) !== 0 && n !== null) {
                l = void 0, a = t, u = n.memoizedProps, n = n.memoizedState, e = a.stateNode;
                try {
                  var H = ae(
                    a.type,
                    u
                  );
                  l = e.getSnapshotBeforeUpdate(
                    H,
                    n
                  ), e.__reactInternalSnapshotBeforeUpdate = l;
                } catch (Z) {
                  ol(
                    a,
                    a.return,
                    Z
                  );
                }
              }
              break;
            case 3:
              if ((l & 1024) !== 0) {
                if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9)
                  bf(l);
                else if (a === 1)
                  switch (l.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      bf(l);
                      break;
                    default:
                      l.textContent = "";
                  }
              }
              break;
            case 5:
            case 26:
            case 27:
            case 6:
            case 4:
            case 17:
              break;
            default:
              if ((l & 1024) !== 0) throw Error(r(163));
          }
          if (l = t.sibling, l !== null) {
            l.return = t.return, Ql = l;
            break;
          }
          Ql = t.return;
        }
  }
  function bd(l, t, a) {
    var e = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        ea(l, a), e & 4 && zu(5, a);
        break;
      case 1:
        if (ea(l, a), e & 4)
          if (l = a.stateNode, t === null)
            try {
              l.componentDidMount();
            } catch (i) {
              ol(a, a.return, i);
            }
          else {
            var u = ae(
              a.type,
              t.memoizedProps
            );
            t = t.memoizedState;
            try {
              l.componentDidUpdate(
                u,
                t,
                l.__reactInternalSnapshotBeforeUpdate
              );
            } catch (i) {
              ol(
                a,
                a.return,
                i
              );
            }
          }
        e & 64 && hd(a), e & 512 && ju(a, a.return);
        break;
      case 3:
        if (ea(l, a), e & 64 && (l = a.updateQueue, l !== null)) {
          if (t = null, a.child !== null)
            switch (a.child.tag) {
              case 27:
              case 5:
                t = a.child.stateNode;
                break;
              case 1:
                t = a.child.stateNode;
            }
          try {
            er(l, t);
          } catch (i) {
            ol(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && e & 4 && gd(a);
      case 26:
      case 5:
        ea(l, a), t === null && e & 4 && vd(a), e & 512 && ju(a, a.return);
        break;
      case 12:
        ea(l, a);
        break;
      case 31:
        ea(l, a), e & 4 && Ad(l, a);
        break;
      case 13:
        ea(l, a), e & 4 && xd(l, a), e & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Hm.bind(
          null,
          a
        ), t0(l, a))));
        break;
      case 22:
        if (e = a.memoizedState !== null || ta, !e) {
          t = t !== null && t.memoizedState !== null || Rl, u = ta;
          var n = Rl;
          ta = e, (Rl = t) && !n ? ua(
            l,
            a,
            (a.subtreeFlags & 8772) !== 0
          ) : ea(l, a), ta = u, Rl = n;
        }
        break;
      case 30:
        break;
      default:
        ea(l, a);
    }
  }
  function pd(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, pd(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && xi(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var pl = null, nt = !1;
  function aa(l, t, a) {
    for (a = a.child; a !== null; )
      Ed(l, t, a), a = a.sibling;
  }
  function Ed(l, t, a) {
    if (L && typeof L.onCommitFiberUnmount == "function")
      try {
        L.onCommitFiberUnmount(Qa, a);
      } catch {
      }
    switch (a.tag) {
      case 26:
        Rl || Xt(a, t), aa(
          l,
          t,
          a
        ), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Rl || Xt(a, t);
        var e = pl, u = nt;
        Oa(a.type) && (pl = a.stateNode, nt = !1), aa(
          l,
          t,
          a
        ), Hu(a.stateNode), pl = e, nt = u;
        break;
      case 5:
        Rl || Xt(a, t);
      case 6:
        if (e = pl, u = nt, pl = null, aa(
          l,
          t,
          a
        ), pl = e, nt = u, pl !== null)
          if (nt)
            try {
              (pl.nodeType === 9 ? pl.body : pl.nodeName === "HTML" ? pl.ownerDocument.body : pl).removeChild(a.stateNode);
            } catch (n) {
              ol(
                a,
                t,
                n
              );
            }
          else
            try {
              pl.removeChild(a.stateNode);
            } catch (n) {
              ol(
                a,
                t,
                n
              );
            }
        break;
      case 18:
        pl !== null && (nt ? (l = pl, mo(
          l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l,
          a.stateNode
        ), Je(l)) : mo(pl, a.stateNode));
        break;
      case 4:
        e = pl, u = nt, pl = a.stateNode.containerInfo, nt = !0, aa(
          l,
          t,
          a
        ), pl = e, nt = u;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        Ea(2, a, t), Rl || Ea(4, a, t), aa(
          l,
          t,
          a
        );
        break;
      case 1:
        Rl || (Xt(a, t), e = a.stateNode, typeof e.componentWillUnmount == "function" && md(
          a,
          t,
          e
        )), aa(
          l,
          t,
          a
        );
        break;
      case 21:
        aa(
          l,
          t,
          a
        );
        break;
      case 22:
        Rl = (e = Rl) || a.memoizedState !== null, aa(
          l,
          t,
          a
        ), Rl = e;
        break;
      default:
        aa(
          l,
          t,
          a
        );
    }
  }
  function Ad(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Je(l);
      } catch (a) {
        ol(t, t.return, a);
      }
    }
  }
  function xd(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null))))
      try {
        Je(l);
      } catch (a) {
        ol(t, t.return, a);
      }
  }
  function _m(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Sd()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Sd()), t;
      default:
        throw Error(r(435, l.tag));
    }
  }
  function Hn(l, t) {
    var a = _m(l);
    t.forEach(function(e) {
      if (!a.has(e)) {
        a.add(e);
        var u = Bm.bind(null, l, e);
        e.then(u, u);
      }
    });
  }
  function it(l, t) {
    var a = t.deletions;
    if (a !== null)
      for (var e = 0; e < a.length; e++) {
        var u = a[e], n = l, i = t, c = i;
        l: for (; c !== null; ) {
          switch (c.tag) {
            case 27:
              if (Oa(c.type)) {
                pl = c.stateNode, nt = !1;
                break l;
              }
              break;
            case 5:
              pl = c.stateNode, nt = !1;
              break l;
            case 3:
            case 4:
              pl = c.stateNode.containerInfo, nt = !0;
              break l;
          }
          c = c.return;
        }
        if (pl === null) throw Error(r(160));
        Ed(n, i, u), pl = null, nt = !1, n = u.alternate, n !== null && (n.return = null), u.return = null;
      }
    if (t.subtreeFlags & 13886)
      for (t = t.child; t !== null; )
        Td(t, l), t = t.sibling;
  }
  var Rt = null;
  function Td(l, t) {
    var a = l.alternate, e = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        it(t, l), ct(l), e & 4 && (Ea(3, l, l.return), zu(3, l), Ea(5, l, l.return));
        break;
      case 1:
        it(t, l), ct(l), e & 512 && (Rl || a === null || Xt(a, a.return)), e & 64 && ta && (l = l.updateQueue, l !== null && (e = l.callbacks, e !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? e : a.concat(e))));
        break;
      case 26:
        var u = Rt;
        if (it(t, l), ct(l), e & 512 && (Rl || a === null || Xt(a, a.return)), e & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (e = l.memoizedState, a === null)
            if (e === null)
              if (l.stateNode === null) {
                l: {
                  e = l.type, a = l.memoizedProps, u = u.ownerDocument || u;
                  t: switch (e) {
                    case "title":
                      n = u.getElementsByTagName("title")[0], (!n || n[Pe] || n[Zl] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = u.createElement(e), u.head.insertBefore(
                        n,
                        u.querySelector("head > title")
                      )), wl(n, e, a), n[Zl] = l, Gl(n), e = n;
                      break l;
                    case "link":
                      var i = zo(
                        "link",
                        "href",
                        u
                      ).get(e + (a.href || ""));
                      if (i) {
                        for (var c = 0; c < i.length; c++)
                          if (n = i[c], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                            i.splice(c, 1);
                            break t;
                          }
                      }
                      n = u.createElement(e), wl(n, e, a), u.head.appendChild(n);
                      break;
                    case "meta":
                      if (i = zo(
                        "meta",
                        "content",
                        u
                      ).get(e + (a.content || ""))) {
                        for (c = 0; c < i.length; c++)
                          if (n = i[c], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                            i.splice(c, 1);
                            break t;
                          }
                      }
                      n = u.createElement(e), wl(n, e, a), u.head.appendChild(n);
                      break;
                    default:
                      throw Error(r(468, e));
                  }
                  n[Zl] = l, Gl(n), e = n;
                }
                l.stateNode = e;
              } else
                jo(
                  u,
                  l.type,
                  l.stateNode
                );
            else
              l.stateNode = To(
                u,
                e,
                l.memoizedProps
              );
          else
            n !== e ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, e === null ? jo(
              u,
              l.type,
              l.stateNode
            ) : To(
              u,
              e,
              l.memoizedProps
            )) : e === null && l.stateNode !== null && Vc(
              l,
              l.memoizedProps,
              a.memoizedProps
            );
        }
        break;
      case 27:
        it(t, l), ct(l), e & 512 && (Rl || a === null || Xt(a, a.return)), a !== null && e & 4 && Vc(
          l,
          l.memoizedProps,
          a.memoizedProps
        );
        break;
      case 5:
        if (it(t, l), ct(l), e & 512 && (Rl || a === null || Xt(a, a.return)), l.flags & 32) {
          u = l.stateNode;
          try {
            ve(u, "");
          } catch (H) {
            ol(l, l.return, H);
          }
        }
        e & 4 && l.stateNode != null && (u = l.memoizedProps, Vc(
          l,
          u,
          a !== null ? a.memoizedProps : u
        )), e & 1024 && (wc = !0);
        break;
      case 6:
        if (it(t, l), ct(l), e & 4) {
          if (l.stateNode === null)
            throw Error(r(162));
          e = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = e;
          } catch (H) {
            ol(l, l.return, H);
          }
        }
        break;
      case 3:
        if ($n = null, u = Rt, Rt = Fn(t.containerInfo), it(t, l), Rt = u, ct(l), e & 4 && a !== null && a.memoizedState.isDehydrated)
          try {
            Je(t.containerInfo);
          } catch (H) {
            ol(l, l.return, H);
          }
        wc && (wc = !1, zd(l));
        break;
      case 4:
        e = Rt, Rt = Fn(
          l.stateNode.containerInfo
        ), it(t, l), ct(l), Rt = e;
        break;
      case 12:
        it(t, l), ct(l);
        break;
      case 31:
        it(t, l), ct(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, Hn(l, e)));
        break;
      case 13:
        it(t, l), ct(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (qn = Il()), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, Hn(l, e)));
        break;
      case 22:
        u = l.memoizedState !== null;
        var d = a !== null && a.memoizedState !== null, g = ta, A = Rl;
        if (ta = g || u, Rl = A || d, it(t, l), Rl = A, ta = g, ct(l), e & 8192)
          l: for (t = l.stateNode, t._visibility = u ? t._visibility & -2 : t._visibility | 1, u && (a === null || d || ta || Rl || ee(l)), a = null, t = l; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (a === null) {
                d = a = t;
                try {
                  if (n = d.stateNode, u)
                    i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                  else {
                    c = d.stateNode;
                    var z = d.memoizedProps.style, S = z != null && z.hasOwnProperty("display") ? z.display : null;
                    c.style.display = S == null || typeof S == "boolean" ? "" : ("" + S).trim();
                  }
                } catch (H) {
                  ol(d, d.return, H);
                }
              }
            } else if (t.tag === 6) {
              if (a === null) {
                d = t;
                try {
                  d.stateNode.nodeValue = u ? "" : d.memoizedProps;
                } catch (H) {
                  ol(d, d.return, H);
                }
              }
            } else if (t.tag === 18) {
              if (a === null) {
                d = t;
                try {
                  var b = d.stateNode;
                  u ? vo(b, !0) : vo(d.stateNode, !1);
                } catch (H) {
                  ol(d, d.return, H);
                }
              }
            } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === l) && t.child !== null) {
              t.child.return = t, t = t.child;
              continue;
            }
            if (t === l) break l;
            for (; t.sibling === null; ) {
              if (t.return === null || t.return === l) break l;
              a === t && (a = null), t = t.return;
            }
            a === t && (a = null), t.sibling.return = t.return, t = t.sibling;
          }
        e & 4 && (e = l.updateQueue, e !== null && (a = e.retryQueue, a !== null && (e.retryQueue = null, Hn(l, a))));
        break;
      case 19:
        it(t, l), ct(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, Hn(l, e)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        it(t, l), ct(l);
    }
  }
  function ct(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, e = l.return; e !== null; ) {
          if (yd(e)) {
            a = e;
            break;
          }
          e = e.return;
        }
        if (a == null) throw Error(r(160));
        switch (a.tag) {
          case 27:
            var u = a.stateNode, n = Kc(l);
            Rn(l, n, u);
            break;
          case 5:
            var i = a.stateNode;
            a.flags & 32 && (ve(i, ""), a.flags &= -33);
            var c = Kc(l);
            Rn(l, c, i);
            break;
          case 3:
          case 4:
            var d = a.stateNode.containerInfo, g = Kc(l);
            Jc(
              l,
              g,
              d
            );
            break;
          default:
            throw Error(r(161));
        }
      } catch (A) {
        ol(l, l.return, A);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function zd(l) {
    if (l.subtreeFlags & 1024)
      for (l = l.child; l !== null; ) {
        var t = l;
        zd(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
      }
  }
  function ea(l, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        bd(l, t.alternate, t), t = t.sibling;
  }
  function ee(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          Ea(4, t, t.return), ee(t);
          break;
        case 1:
          Xt(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && md(
            t,
            t.return,
            a
          ), ee(t);
          break;
        case 27:
          Hu(t.stateNode);
        case 26:
        case 5:
          Xt(t, t.return), ee(t);
          break;
        case 22:
          t.memoizedState === null && ee(t);
          break;
        case 30:
          ee(t);
          break;
        default:
          ee(t);
      }
      l = l.sibling;
    }
  }
  function ua(l, t, a) {
    for (a = a && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var e = t.alternate, u = l, n = t, i = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          ua(
            u,
            n,
            a
          ), zu(4, n);
          break;
        case 1:
          if (ua(
            u,
            n,
            a
          ), e = n, u = e.stateNode, typeof u.componentDidMount == "function")
            try {
              u.componentDidMount();
            } catch (g) {
              ol(e, e.return, g);
            }
          if (e = n, u = e.updateQueue, u !== null) {
            var c = e.stateNode;
            try {
              var d = u.shared.hiddenCallbacks;
              if (d !== null)
                for (u.shared.hiddenCallbacks = null, u = 0; u < d.length; u++)
                  ar(d[u], c);
            } catch (g) {
              ol(e, e.return, g);
            }
          }
          a && i & 64 && hd(n), ju(n, n.return);
          break;
        case 27:
          gd(n);
        case 26:
        case 5:
          ua(
            u,
            n,
            a
          ), a && e === null && i & 4 && vd(n), ju(n, n.return);
          break;
        case 12:
          ua(
            u,
            n,
            a
          );
          break;
        case 31:
          ua(
            u,
            n,
            a
          ), a && i & 4 && Ad(u, n);
          break;
        case 13:
          ua(
            u,
            n,
            a
          ), a && i & 4 && xd(u, n);
          break;
        case 22:
          n.memoizedState === null && ua(
            u,
            n,
            a
          ), ju(n, n.return);
          break;
        case 30:
          break;
        default:
          ua(
            u,
            n,
            a
          );
      }
      t = t.sibling;
    }
  }
  function kc(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && ou(a));
  }
  function Fc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && ou(l));
  }
  function Ht(l, t, a, e) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        jd(
          l,
          t,
          a,
          e
        ), t = t.sibling;
  }
  function jd(l, t, a, e) {
    var u = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Ht(
          l,
          t,
          a,
          e
        ), u & 2048 && zu(9, t);
        break;
      case 1:
        Ht(
          l,
          t,
          a,
          e
        );
        break;
      case 3:
        Ht(
          l,
          t,
          a,
          e
        ), u & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && ou(l)));
        break;
      case 12:
        if (u & 2048) {
          Ht(
            l,
            t,
            a,
            e
          ), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, c = n.onPostCommit;
            typeof c == "function" && c(
              i,
              t.alternate === null ? "mount" : "update",
              l.passiveEffectDuration,
              -0
            );
          } catch (d) {
            ol(t, t.return, d);
          }
        } else
          Ht(
            l,
            t,
            a,
            e
          );
        break;
      case 31:
        Ht(
          l,
          t,
          a,
          e
        );
        break;
      case 13:
        Ht(
          l,
          t,
          a,
          e
        );
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Ht(
          l,
          t,
          a,
          e
        ) : _u(l, t) : n._visibility & 2 ? Ht(
          l,
          t,
          a,
          e
        ) : (n._visibility |= 2, He(
          l,
          t,
          a,
          e,
          (t.subtreeFlags & 10256) !== 0 || !1
        )), u & 2048 && kc(i, t);
        break;
      case 24:
        Ht(
          l,
          t,
          a,
          e
        ), u & 2048 && Fc(t.alternate, t);
        break;
      default:
        Ht(
          l,
          t,
          a,
          e
        );
    }
  }
  function He(l, t, a, e, u) {
    for (u = u && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, c = a, d = e, g = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          He(
            n,
            i,
            c,
            d,
            u
          ), zu(8, i);
          break;
        case 23:
          break;
        case 22:
          var A = i.stateNode;
          i.memoizedState !== null ? A._visibility & 2 ? He(
            n,
            i,
            c,
            d,
            u
          ) : _u(
            n,
            i
          ) : (A._visibility |= 2, He(
            n,
            i,
            c,
            d,
            u
          )), u && g & 2048 && kc(
            i.alternate,
            i
          );
          break;
        case 24:
          He(
            n,
            i,
            c,
            d,
            u
          ), u && g & 2048 && Fc(i.alternate, i);
          break;
        default:
          He(
            n,
            i,
            c,
            d,
            u
          );
      }
      t = t.sibling;
    }
  }
  function _u(l, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var a = l, e = t, u = e.flags;
        switch (e.tag) {
          case 22:
            _u(a, e), u & 2048 && kc(
              e.alternate,
              e
            );
            break;
          case 24:
            _u(a, e), u & 2048 && Fc(e.alternate, e);
            break;
          default:
            _u(a, e);
        }
        t = t.sibling;
      }
  }
  var Ou = 8192;
  function Be(l, t, a) {
    if (l.subtreeFlags & Ou)
      for (l = l.child; l !== null; )
        _d(
          l,
          t,
          a
        ), l = l.sibling;
  }
  function _d(l, t, a) {
    switch (l.tag) {
      case 26:
        Be(
          l,
          t,
          a
        ), l.flags & Ou && l.memoizedState !== null && h0(
          a,
          Rt,
          l.memoizedState,
          l.memoizedProps
        );
        break;
      case 5:
        Be(
          l,
          t,
          a
        );
        break;
      case 3:
      case 4:
        var e = Rt;
        Rt = Fn(l.stateNode.containerInfo), Be(
          l,
          t,
          a
        ), Rt = e;
        break;
      case 22:
        l.memoizedState === null && (e = l.alternate, e !== null && e.memoizedState !== null ? (e = Ou, Ou = 16777216, Be(
          l,
          t,
          a
        ), Ou = e) : Be(
          l,
          t,
          a
        ));
        break;
      default:
        Be(
          l,
          t,
          a
        );
    }
  }
  function Od(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function Nu(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var e = t[a];
          Ql = e, Ud(
            e,
            l
          );
        }
      Od(l);
    }
    if (l.subtreeFlags & 10256)
      for (l = l.child; l !== null; )
        Nd(l), l = l.sibling;
  }
  function Nd(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        Nu(l), l.flags & 2048 && Ea(9, l, l.return);
        break;
      case 3:
        Nu(l);
        break;
      case 12:
        Nu(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, Bn(l)) : Nu(l);
        break;
      default:
        Nu(l);
    }
  }
  function Bn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var a = 0; a < t.length; a++) {
          var e = t[a];
          Ql = e, Ud(
            e,
            l
          );
        }
      Od(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          Ea(8, t, t.return), Bn(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, Bn(t));
          break;
        default:
          Bn(t);
      }
      l = l.sibling;
    }
  }
  function Ud(l, t) {
    for (; Ql !== null; ) {
      var a = Ql;
      switch (a.tag) {
        case 0:
        case 11:
        case 15:
          Ea(8, a, t);
          break;
        case 23:
        case 22:
          if (a.memoizedState !== null && a.memoizedState.cachePool !== null) {
            var e = a.memoizedState.cachePool.pool;
            e != null && e.refCount++;
          }
          break;
        case 24:
          ou(a.memoizedState.cache);
      }
      if (e = a.child, e !== null) e.return = a, Ql = e;
      else
        l: for (a = l; Ql !== null; ) {
          e = Ql;
          var u = e.sibling, n = e.return;
          if (pd(e), e === a) {
            Ql = null;
            break l;
          }
          if (u !== null) {
            u.return = n, Ql = u;
            break l;
          }
          Ql = n;
        }
    }
  }
  var Om = {
    getCacheForType: function(l) {
      var t = Kl(Ml), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Kl(Ml).controller.signal;
    }
  }, Nm = typeof WeakMap == "function" ? WeakMap : Map, fl = 0, yl = null, P = null, al = 0, dl = 0, yt = null, Aa = !1, qe = !1, Wc = !1, na = 0, zl = 0, xa = 0, ue = 0, $c = 0, gt = 0, Ye = 0, Uu = null, ft = null, Ic = !1, qn = 0, Md = 0, Yn = 1 / 0, Gn = null, Ta = null, ql = 0, za = null, Ge = null, ia = 0, Pc = 0, lf = null, Dd = null, Mu = 0, tf = null;
  function St() {
    return (fl & 2) !== 0 && al !== 0 ? al & -al : x.T !== null ? ff() : kf();
  }
  function Cd() {
    if (gt === 0)
      if ((al & 536870912) === 0 || ul) {
        var l = Xa;
        Xa <<= 1, (Xa & 3932160) === 0 && (Xa = 262144), gt = l;
      } else gt = 536870912;
    return l = mt.current, l !== null && (l.flags |= 32), gt;
  }
  function st(l, t, a) {
    (l === yl && (dl === 2 || dl === 9) || l.cancelPendingCommit !== null) && (Qe(l, 0), ja(
      l,
      al,
      gt,
      !1
    )), Ie(l, a), ((fl & 2) === 0 || l !== yl) && (l === yl && ((fl & 2) === 0 && (ue |= a), zl === 4 && ja(
      l,
      al,
      gt,
      !1
    )), Lt(l));
  }
  function Rd(l, t, a) {
    if ((fl & 6) !== 0) throw Error(r(327));
    var e = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || $e(l, t), u = e ? Dm(l, t) : ef(l, t, !0), n = e;
    do {
      if (u === 0) {
        qe && !e && ja(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !Um(a)) {
          u = ef(l, t, !1), n = !1;
          continue;
        }
        if (u === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n)
            var i = 0;
          else
            i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              u = Uu;
              var d = c.current.memoizedState.isDehydrated;
              if (d && (Qe(c, i).flags |= 256), i = ef(
                c,
                i,
                !1
              ), i !== 2) {
                if (Wc && !d) {
                  c.errorRecoveryDisabledLanes |= n, ue |= n, u = 4;
                  break l;
                }
                n = ft, ft = u, n !== null && (ft === null ? ft = n : ft.push.apply(
                  ft,
                  n
                ));
              }
              u = i;
            }
            if (n = !1, u !== 2) continue;
          }
        }
        if (u === 1) {
          Qe(l, 0), ja(l, t, 0, !0);
          break;
        }
        l: {
          switch (e = l, n = u, n) {
            case 0:
            case 1:
              throw Error(r(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              ja(
                e,
                t,
                gt,
                !Aa
              );
              break l;
            case 2:
              ft = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(r(329));
          }
          if ((t & 62914560) === t && (u = qn + 300 - Il(), 10 < u)) {
            if (ja(
              e,
              t,
              gt,
              !Aa
            ), ku(e, 0, !0) !== 0) break l;
            ia = t, e.timeoutHandle = oo(
              Hd.bind(
                null,
                e,
                a,
                ft,
                Gn,
                Ic,
                t,
                gt,
                ue,
                Ye,
                Aa,
                n,
                "Throttled",
                -0,
                0
              ),
              u
            );
            break l;
          }
          Hd(
            e,
            a,
            ft,
            Gn,
            Ic,
            t,
            gt,
            ue,
            Ye,
            Aa,
            n,
            null,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    Lt(l);
  }
  function Hd(l, t, a, e, u, n, i, c, d, g, A, z, S, b) {
    if (l.timeoutHandle = -1, z = t.subtreeFlags, z & 8192 || (z & 16785408) === 16785408) {
      z = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Kt
      }, _d(
        t,
        n,
        z
      );
      var H = (n & 62914560) === n ? qn - Il() : (n & 4194048) === n ? Md - Il() : 0;
      if (H = m0(
        z,
        H
      ), H !== null) {
        ia = n, l.cancelPendingCommit = H(
          Zd.bind(
            null,
            l,
            t,
            n,
            a,
            e,
            u,
            i,
            c,
            d,
            A,
            z,
            null,
            S,
            b
          )
        ), ja(l, n, i, !g);
        return;
      }
    }
    Zd(
      l,
      t,
      n,
      a,
      e,
      u,
      i,
      c,
      d
    );
  }
  function Um(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null)))
        for (var e = 0; e < a.length; e++) {
          var u = a[e], n = u.getSnapshot;
          u = u.value;
          try {
            if (!ot(n(), u)) return !1;
          } catch {
            return !1;
          }
        }
      if (a = t.child, t.subtreeFlags & 16384 && a !== null)
        a.return = t, t = a;
      else {
        if (t === l) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === l) return !0;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return !0;
  }
  function ja(l, t, a, e) {
    t &= ~$c, t &= ~ue, l.suspendedLanes |= t, l.pingedLanes &= ~t, e && (l.warmLanes |= t), e = l.expirationTimes;
    for (var u = t; 0 < u; ) {
      var n = 31 - _l(u), i = 1 << n;
      e[n] = -1, u &= ~i;
    }
    a !== 0 && Kf(l, a, t);
  }
  function Qn() {
    return (fl & 6) === 0 ? (Du(0), !1) : !0;
  }
  function af() {
    if (P !== null) {
      if (dl === 0)
        var l = P.return;
      else
        l = P, Ft = Fa = null, Sc(l), Ue = null, mu = 0, l = P;
      for (; l !== null; )
        od(l.alternate, l), l = l.return;
      P = null;
    }
  }
  function Qe(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, Wm(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), ia = 0, af(), yl = l, P = a = wt(l.current, null), al = t, dl = 0, yt = null, Aa = !1, qe = $e(l, t), Wc = !1, Ye = gt = $c = ue = xa = zl = 0, ft = Uu = null, Ic = !1, (t & 8) !== 0 && (t |= t & 32);
    var e = l.entangledLanes;
    if (e !== 0)
      for (l = l.entanglements, e &= t; 0 < e; ) {
        var u = 31 - _l(e), n = 1 << u;
        t |= l[u], e &= ~n;
      }
    return na = t, cn(), a;
  }
  function Bd(l, t) {
    F = null, x.H = Au, t === Ne || t === vn ? (t = Is(), dl = 3) : t === ic ? (t = Is(), dl = 4) : dl = t === Rc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, yt = t, P === null && (zl = 1, Nn(
      l,
      Tt(t, l.current)
    ));
  }
  function qd() {
    var l = mt.current;
    return l === null ? !0 : (al & 4194048) === al ? Ot === null : (al & 62914560) === al || (al & 536870912) !== 0 ? l === Ot : !1;
  }
  function Yd() {
    var l = x.H;
    return x.H = Au, l === null ? Au : l;
  }
  function Gd() {
    var l = x.A;
    return x.A = Om, l;
  }
  function Xn() {
    zl = 4, Aa || (al & 4194048) !== al && mt.current !== null || (qe = !0), (xa & 134217727) === 0 && (ue & 134217727) === 0 || yl === null || ja(
      yl,
      al,
      gt,
      !1
    );
  }
  function ef(l, t, a) {
    var e = fl;
    fl |= 2;
    var u = Yd(), n = Gd();
    (yl !== l || al !== t) && (Gn = null, Qe(l, t)), t = !1;
    var i = zl;
    l: do
      try {
        if (dl !== 0 && P !== null) {
          var c = P, d = yt;
          switch (dl) {
            case 8:
              af(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              mt.current === null && (t = !0);
              var g = dl;
              if (dl = 0, yt = null, Xe(l, c, d, g), a && qe) {
                i = 0;
                break l;
              }
              break;
            default:
              g = dl, dl = 0, yt = null, Xe(l, c, d, g);
          }
        }
        Mm(), i = zl;
        break;
      } catch (A) {
        Bd(l, A);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Ft = Fa = null, fl = e, x.H = u, x.A = n, P === null && (yl = null, al = 0, cn()), i;
  }
  function Mm() {
    for (; P !== null; ) Qd(P);
  }
  function Dm(l, t) {
    var a = fl;
    fl |= 2;
    var e = Yd(), u = Gd();
    yl !== l || al !== t ? (Gn = null, Yn = Il() + 500, Qe(l, t)) : qe = $e(
      l,
      t
    );
    l: do
      try {
        if (dl !== 0 && P !== null) {
          t = P;
          var n = yt;
          t: switch (dl) {
            case 1:
              dl = 0, yt = null, Xe(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (Ws(n)) {
                dl = 0, yt = null, Xd(t);
                break;
              }
              t = function() {
                dl !== 2 && dl !== 9 || yl !== l || (dl = 7), Lt(l);
              }, n.then(t, t);
              break l;
            case 3:
              dl = 7;
              break l;
            case 4:
              dl = 5;
              break l;
            case 7:
              Ws(n) ? (dl = 0, yt = null, Xd(t)) : (dl = 0, yt = null, Xe(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch (P.tag) {
                case 26:
                  i = P.memoizedState;
                case 5:
                case 27:
                  var c = P;
                  if (i ? _o(i) : c.stateNode.complete) {
                    dl = 0, yt = null;
                    var d = c.sibling;
                    if (d !== null) P = d;
                    else {
                      var g = c.return;
                      g !== null ? (P = g, Ln(g)) : P = null;
                    }
                    break t;
                  }
              }
              dl = 0, yt = null, Xe(l, t, n, 5);
              break;
            case 6:
              dl = 0, yt = null, Xe(l, t, n, 6);
              break;
            case 8:
              af(), zl = 6;
              break l;
            default:
              throw Error(r(462));
          }
        }
        Cm();
        break;
      } catch (A) {
        Bd(l, A);
      }
    while (!0);
    return Ft = Fa = null, x.H = e, x.A = u, fl = a, P !== null ? 0 : (yl = null, al = 0, cn(), zl);
  }
  function Cm() {
    for (; P !== null && !ri(); )
      Qd(P);
  }
  function Qd(l) {
    var t = rd(l.alternate, l, na);
    l.memoizedProps = l.pendingProps, t === null ? Ln(l) : P = t;
  }
  function Xd(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = ud(
          a,
          t,
          t.pendingProps,
          t.type,
          void 0,
          al
        );
        break;
      case 11:
        t = ud(
          a,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          al
        );
        break;
      case 5:
        Sc(t);
      default:
        od(a, t), t = P = Gs(t, na), t = rd(a, t, na);
    }
    l.memoizedProps = l.pendingProps, t === null ? Ln(l) : P = t;
  }
  function Xe(l, t, a, e) {
    Ft = Fa = null, Sc(t), Ue = null, mu = 0;
    var u = t.return;
    try {
      if (Em(
        l,
        u,
        t,
        a,
        al
      )) {
        zl = 1, Nn(
          l,
          Tt(a, l.current)
        ), P = null;
        return;
      }
    } catch (n) {
      if (u !== null) throw P = u, n;
      zl = 1, Nn(
        l,
        Tt(a, l.current)
      ), P = null;
      return;
    }
    t.flags & 32768 ? (ul || e === 1 ? l = !0 : qe || (al & 536870912) !== 0 ? l = !1 : (Aa = l = !0, (e === 2 || e === 9 || e === 3 || e === 6) && (e = mt.current, e !== null && e.tag === 13 && (e.flags |= 16384))), Ld(t, l)) : Ln(t);
  }
  function Ln(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        Ld(
          t,
          Aa
        );
        return;
      }
      l = t.return;
      var a = Tm(
        t.alternate,
        t,
        na
      );
      if (a !== null) {
        P = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        P = t;
        return;
      }
      P = t = l;
    } while (t !== null);
    zl === 0 && (zl = 5);
  }
  function Ld(l, t) {
    do {
      var a = zm(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, P = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        P = l;
        return;
      }
      P = l = a;
    } while (l !== null);
    zl = 6, P = null;
  }
  function Zd(l, t, a, e, u, n, i, c, d) {
    l.cancelPendingCommit = null;
    do
      Zn();
    while (ql !== 0);
    if ((fl & 6) !== 0) throw Error(r(327));
    if (t !== null) {
      if (t === l.current) throw Error(r(177));
      if (n = t.lanes | t.childLanes, n |= Ki, oh(
        l,
        a,
        n,
        i,
        c,
        d
      ), l === yl && (P = yl = null, al = 0), Ge = t, za = l, ia = a, Pc = n, lf = u, Dd = e, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, qm(ie, function() {
        return kd(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), e = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || e) {
        e = x.T, x.T = null, u = D.p, D.p = 2, i = fl, fl |= 4;
        try {
          jm(l, t, a);
        } finally {
          fl = i, D.p = u, x.T = e;
        }
      }
      ql = 1, Vd(), Kd(), Jd();
    }
  }
  function Vd() {
    if (ql === 1) {
      ql = 0;
      var l = za, t = Ge, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = x.T, x.T = null;
        var e = D.p;
        D.p = 2;
        var u = fl;
        fl |= 4;
        try {
          Td(t, l);
          var n = yf, i = Us(l.containerInfo), c = n.focusedElem, d = n.selectionRange;
          if (i !== c && c && c.ownerDocument && Ns(
            c.ownerDocument.documentElement,
            c
          )) {
            if (d !== null && Qi(c)) {
              var g = d.start, A = d.end;
              if (A === void 0 && (A = g), "selectionStart" in c)
                c.selectionStart = g, c.selectionEnd = Math.min(
                  A,
                  c.value.length
                );
              else {
                var z = c.ownerDocument || document, S = z && z.defaultView || window;
                if (S.getSelection) {
                  var b = S.getSelection(), H = c.textContent.length, Z = Math.min(d.start, H), vl = d.end === void 0 ? Z : Math.min(d.end, H);
                  !b.extend && Z > vl && (i = vl, vl = Z, Z = i);
                  var v = Os(
                    c,
                    Z
                  ), o = Os(
                    c,
                    vl
                  );
                  if (v && o && (b.rangeCount !== 1 || b.anchorNode !== v.node || b.anchorOffset !== v.offset || b.focusNode !== o.node || b.focusOffset !== o.offset)) {
                    var y = z.createRange();
                    y.setStart(v.node, v.offset), b.removeAllRanges(), Z > vl ? (b.addRange(y), b.extend(o.node, o.offset)) : (y.setEnd(o.node, o.offset), b.addRange(y));
                  }
                }
              }
            }
            for (z = [], b = c; b = b.parentNode; )
              b.nodeType === 1 && z.push({
                element: b,
                left: b.scrollLeft,
                top: b.scrollTop
              });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < z.length; c++) {
              var T = z[c];
              T.element.scrollLeft = T.left, T.element.scrollTop = T.top;
            }
          }
          ti = !!vf, yf = vf = null;
        } finally {
          fl = u, D.p = e, x.T = a;
        }
      }
      l.current = t, ql = 2;
    }
  }
  function Kd() {
    if (ql === 2) {
      ql = 0;
      var l = za, t = Ge, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = x.T, x.T = null;
        var e = D.p;
        D.p = 2;
        var u = fl;
        fl |= 4;
        try {
          bd(l, t.alternate, t);
        } finally {
          fl = u, D.p = e, x.T = a;
        }
      }
      ql = 3;
    }
  }
  function Jd() {
    if (ql === 4 || ql === 3) {
      ql = 0, di();
      var l = za, t = Ge, a = ia, e = Dd;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? ql = 5 : (ql = 0, Ge = za = null, wd(l, l.pendingLanes));
      var u = l.pendingLanes;
      if (u === 0 && (Ta = null), Ei(a), t = t.stateNode, L && typeof L.onCommitFiberRoot == "function")
        try {
          L.onCommitFiberRoot(
            Qa,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (e !== null) {
        t = x.T, u = D.p, D.p = 2, x.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < e.length; i++) {
            var c = e[i];
            n(c.value, {
              componentStack: c.stack
            });
          }
        } finally {
          x.T = t, D.p = u;
        }
      }
      (ia & 3) !== 0 && Zn(), Lt(l), u = l.pendingLanes, (a & 261930) !== 0 && (u & 42) !== 0 ? l === tf ? Mu++ : (Mu = 0, tf = l) : Mu = 0, Du(0);
    }
  }
  function wd(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, ou(t)));
  }
  function Zn() {
    return Vd(), Kd(), Jd(), kd();
  }
  function kd() {
    if (ql !== 5) return !1;
    var l = za, t = Pc;
    Pc = 0;
    var a = Ei(ia), e = x.T, u = D.p;
    try {
      D.p = 32 > a ? 32 : a, x.T = null, a = lf, lf = null;
      var n = za, i = ia;
      if (ql = 0, Ge = za = null, ia = 0, (fl & 6) !== 0) throw Error(r(331));
      var c = fl;
      if (fl |= 4, Nd(n.current), jd(
        n,
        n.current,
        i,
        a
      ), fl = c, Du(0, !1), L && typeof L.onPostCommitFiberRoot == "function")
        try {
          L.onPostCommitFiberRoot(Qa, n);
        } catch {
        }
      return !0;
    } finally {
      D.p = u, x.T = e, wd(l, t);
    }
  }
  function Fd(l, t, a) {
    t = Tt(a, t), t = Cc(l.stateNode, t, 2), l = Sa(l, t, 2), l !== null && (Ie(l, 2), Lt(l));
  }
  function ol(l, t, a) {
    if (l.tag === 3)
      Fd(l, l, a);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          Fd(
            t,
            l,
            a
          );
          break;
        } else if (t.tag === 1) {
          var e = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof e.componentDidCatch == "function" && (Ta === null || !Ta.has(e))) {
            l = Tt(a, l), a = Wr(2), e = Sa(t, a, 2), e !== null && ($r(
              a,
              e,
              t,
              l
            ), Ie(e, 2), Lt(e));
            break;
          }
        }
        t = t.return;
      }
  }
  function uf(l, t, a) {
    var e = l.pingCache;
    if (e === null) {
      e = l.pingCache = new Nm();
      var u = /* @__PURE__ */ new Set();
      e.set(t, u);
    } else
      u = e.get(t), u === void 0 && (u = /* @__PURE__ */ new Set(), e.set(t, u));
    u.has(a) || (Wc = !0, u.add(a), l = Rm.bind(null, l, t, a), t.then(l, l));
  }
  function Rm(l, t, a) {
    var e = l.pingCache;
    e !== null && e.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, yl === l && (al & a) === a && (zl === 4 || zl === 3 && (al & 62914560) === al && 300 > Il() - qn ? (fl & 2) === 0 && Qe(l, 0) : $c |= a, Ye === al && (Ye = 0)), Lt(l);
  }
  function Wd(l, t) {
    t === 0 && (t = Vf()), l = Ja(l, t), l !== null && (Ie(l, t), Lt(l));
  }
  function Hm(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), Wd(l, a);
  }
  function Bm(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var e = l.stateNode, u = l.memoizedState;
        u !== null && (a = u.retryLane);
        break;
      case 19:
        e = l.stateNode;
        break;
      case 22:
        e = l.stateNode._retryCache;
        break;
      default:
        throw Error(r(314));
    }
    e !== null && e.delete(t), Wd(l, a);
  }
  function qm(l, t) {
    return We(l, t);
  }
  var Vn = null, Le = null, nf = !1, Kn = !1, cf = !1, _a = 0;
  function Lt(l) {
    l !== Le && l.next === null && (Le === null ? Vn = Le = l : Le = Le.next = l), Kn = !0, nf || (nf = !0, Gm());
  }
  function Du(l, t) {
    if (!cf && Kn) {
      cf = !0;
      do
        for (var a = !1, e = Vn; e !== null; ) {
          if (l !== 0) {
            var u = e.pendingLanes;
            if (u === 0) var n = 0;
            else {
              var i = e.suspendedLanes, c = e.pingedLanes;
              n = (1 << 31 - _l(42 | l) + 1) - 1, n &= u & ~(i & ~c), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, lo(e, n));
          } else
            n = al, n = ku(
              e,
              e === yl ? n : 0,
              e.cancelPendingCommit !== null || e.timeoutHandle !== -1
            ), (n & 3) === 0 || $e(e, n) || (a = !0, lo(e, n));
          e = e.next;
        }
      while (a);
      cf = !1;
    }
  }
  function Ym() {
    $d();
  }
  function $d() {
    Kn = nf = !1;
    var l = 0;
    _a !== 0 && Fm() && (l = _a);
    for (var t = Il(), a = null, e = Vn; e !== null; ) {
      var u = e.next, n = Id(e, t);
      n === 0 ? (e.next = null, a === null ? Vn = u : a.next = u, u === null && (Le = a)) : (a = e, (l !== 0 || (n & 3) !== 0) && (Kn = !0)), e = u;
    }
    ql !== 0 && ql !== 5 || Du(l), _a !== 0 && (_a = 0);
  }
  function Id(l, t) {
    for (var a = l.suspendedLanes, e = l.pingedLanes, u = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - _l(n), c = 1 << i, d = u[i];
      d === -1 ? ((c & a) === 0 || (c & e) !== 0) && (u[i] = dh(c, t)) : d <= t && (l.expiredLanes |= c), n &= ~c;
    }
    if (t = yl, a = al, a = ku(
      l,
      l === t ? a : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), e = l.callbackNode, a === 0 || l === t && (dl === 2 || dl === 9) || l.cancelPendingCommit !== null)
      return e !== null && e !== null && Wl(e), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || $e(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (e !== null && Wl(e), Ei(a)) {
        case 2:
        case 8:
          a = Ju;
          break;
        case 32:
          a = ie;
          break;
        case 268435456:
          a = wu;
          break;
        default:
          a = ie;
      }
      return e = Pd.bind(null, l), a = We(a, e), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return e !== null && e !== null && Wl(e), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function Pd(l, t) {
    if (ql !== 0 && ql !== 5)
      return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (Zn() && l.callbackNode !== a)
      return null;
    var e = al;
    return e = ku(
      l,
      l === yl ? e : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), e === 0 ? null : (Rd(l, e, t), Id(l, Il()), l.callbackNode != null && l.callbackNode === a ? Pd.bind(null, l) : null);
  }
  function lo(l, t) {
    if (Zn()) return null;
    Rd(l, t, !0);
  }
  function Gm() {
    $m(function() {
      (fl & 6) !== 0 ? We(
        Ku,
        Ym
      ) : $d();
    });
  }
  function ff() {
    if (_a === 0) {
      var l = _e;
      l === 0 && (l = ce, ce <<= 1, (ce & 261888) === 0 && (ce = 256)), _a = l;
    }
    return _a;
  }
  function to(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Iu("" + l);
  }
  function ao(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Qm(l, t, a, e, u) {
    if (t === "submit" && a && a.stateNode === u) {
      var n = to(
        (u[et] || null).action
      ), i = e.submitter;
      i && (t = (t = i[et] || null) ? to(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var c = new an(
        "action",
        "action",
        null,
        e,
        u
      );
      l.push({
        event: c,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (e.defaultPrevented) {
                if (_a !== 0) {
                  var d = i ? ao(u, i) : new FormData(u);
                  _c(
                    a,
                    {
                      pending: !0,
                      data: d,
                      method: u.method,
                      action: n
                    },
                    null,
                    d
                  );
                }
              } else
                typeof n == "function" && (c.preventDefault(), d = i ? ao(u, i) : new FormData(u), _c(
                  a,
                  {
                    pending: !0,
                    data: d,
                    method: u.method,
                    action: n
                  },
                  n,
                  d
                ));
            },
            currentTarget: u
          }
        ]
      });
    }
  }
  for (var sf = 0; sf < Vi.length; sf++) {
    var rf = Vi[sf], Xm = rf.toLowerCase(), Lm = rf[0].toUpperCase() + rf.slice(1);
    Ct(
      Xm,
      "on" + Lm
    );
  }
  Ct(Cs, "onAnimationEnd"), Ct(Rs, "onAnimationIteration"), Ct(Hs, "onAnimationStart"), Ct("dblclick", "onDoubleClick"), Ct("focusin", "onFocus"), Ct("focusout", "onBlur"), Ct(um, "onTransitionRun"), Ct(nm, "onTransitionStart"), Ct(im, "onTransitionCancel"), Ct(Bs, "onTransitionEnd"), he("onMouseEnter", ["mouseout", "mouseover"]), he("onMouseLeave", ["mouseout", "mouseover"]), he("onPointerEnter", ["pointerout", "pointerover"]), he("onPointerLeave", ["pointerout", "pointerover"]), La(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), La(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), La("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), La(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), La(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), La(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var Cu = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), Zm = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(Cu)
  );
  function eo(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var e = l[a], u = e.event;
      e = e.listeners;
      l: {
        var n = void 0;
        if (t)
          for (var i = e.length - 1; 0 <= i; i--) {
            var c = e[i], d = c.instance, g = c.currentTarget;
            if (c = c.listener, d !== n && u.isPropagationStopped())
              break l;
            n = c, u.currentTarget = g;
            try {
              n(u);
            } catch (A) {
              nn(A);
            }
            u.currentTarget = null, n = d;
          }
        else
          for (i = 0; i < e.length; i++) {
            if (c = e[i], d = c.instance, g = c.currentTarget, c = c.listener, d !== n && u.isPropagationStopped())
              break l;
            n = c, u.currentTarget = g;
            try {
              n(u);
            } catch (A) {
              nn(A);
            }
            u.currentTarget = null, n = d;
          }
      }
    }
  }
  function ll(l, t) {
    var a = t[Ai];
    a === void 0 && (a = t[Ai] = /* @__PURE__ */ new Set());
    var e = l + "__bubble";
    a.has(e) || (uo(t, l, 2, !1), a.add(e));
  }
  function df(l, t, a) {
    var e = 0;
    t && (e |= 4), uo(
      a,
      l,
      e,
      t
    );
  }
  var Jn = "_reactListening" + Math.random().toString(36).slice(2);
  function of(l) {
    if (!l[Jn]) {
      l[Jn] = !0, $f.forEach(function(a) {
        a !== "selectionchange" && (Zm.has(a) || df(a, !1, l), df(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Jn] || (t[Jn] = !0, df("selectionchange", !1, t));
    }
  }
  function uo(l, t, a, e) {
    switch (Ro(t)) {
      case 2:
        var u = g0;
        break;
      case 8:
        u = S0;
        break;
      default:
        u = _f;
    }
    a = u.bind(
      null,
      t,
      a,
      l
    ), u = void 0, !Mi || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (u = !0), e ? u !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: u
    }) : l.addEventListener(t, a, !0) : u !== void 0 ? l.addEventListener(t, a, {
      passive: u
    }) : l.addEventListener(t, a, !1);
  }
  function hf(l, t, a, e, u) {
    var n = e;
    if ((t & 1) === 0 && (t & 2) === 0 && e !== null)
      l: for (; ; ) {
        if (e === null) return;
        var i = e.tag;
        if (i === 3 || i === 4) {
          var c = e.stateNode.containerInfo;
          if (c === u) break;
          if (i === 4)
            for (i = e.return; i !== null; ) {
              var d = i.tag;
              if ((d === 3 || d === 4) && i.stateNode.containerInfo === u)
                return;
              i = i.return;
            }
          for (; c !== null; ) {
            if (i = re(c), i === null) return;
            if (d = i.tag, d === 5 || d === 6 || d === 26 || d === 27) {
              e = n = i;
              continue l;
            }
            c = c.parentNode;
          }
        }
        e = e.return;
      }
    ss(function() {
      var g = n, A = Ni(a), z = [];
      l: {
        var S = qs.get(l);
        if (S !== void 0) {
          var b = an, H = l;
          switch (l) {
            case "keypress":
              if (ln(a) === 0) break l;
            case "keydown":
            case "keyup":
              b = Bh;
              break;
            case "focusin":
              H = "focus", b = Hi;
              break;
            case "focusout":
              H = "blur", b = Hi;
              break;
            case "beforeblur":
            case "afterblur":
              b = Hi;
              break;
            case "click":
              if (a.button === 2) break l;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              b = os;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              b = Th;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              b = Gh;
              break;
            case Cs:
            case Rs:
            case Hs:
              b = _h;
              break;
            case Bs:
              b = Xh;
              break;
            case "scroll":
            case "scrollend":
              b = Ah;
              break;
            case "wheel":
              b = Zh;
              break;
            case "copy":
            case "cut":
            case "paste":
              b = Nh;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              b = ms;
              break;
            case "toggle":
            case "beforetoggle":
              b = Kh;
          }
          var Z = (t & 4) !== 0, vl = !Z && (l === "scroll" || l === "scrollend"), v = Z ? S !== null ? S + "Capture" : null : S;
          Z = [];
          for (var o = g, y; o !== null; ) {
            var T = o;
            if (y = T.stateNode, T = T.tag, T !== 5 && T !== 26 && T !== 27 || y === null || v === null || (T = tu(o, v), T != null && Z.push(
              Ru(o, T, y)
            )), vl) break;
            o = o.return;
          }
          0 < Z.length && (S = new b(
            S,
            H,
            null,
            a,
            A
          ), z.push({ event: S, listeners: Z }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (S = l === "mouseover" || l === "pointerover", b = l === "mouseout" || l === "pointerout", S && a !== Oi && (H = a.relatedTarget || a.fromElement) && (re(H) || H[se]))
            break l;
          if ((b || S) && (S = A.window === A ? A : (S = A.ownerDocument) ? S.defaultView || S.parentWindow : window, b ? (H = a.relatedTarget || a.toElement, b = g, H = H ? re(H) : null, H !== null && (vl = C(H), Z = H.tag, H !== vl || Z !== 5 && Z !== 27 && Z !== 6) && (H = null)) : (b = null, H = g), b !== H)) {
            if (Z = os, T = "onMouseLeave", v = "onMouseEnter", o = "mouse", (l === "pointerout" || l === "pointerover") && (Z = ms, T = "onPointerLeave", v = "onPointerEnter", o = "pointer"), vl = b == null ? S : lu(b), y = H == null ? S : lu(H), S = new Z(
              T,
              o + "leave",
              b,
              a,
              A
            ), S.target = vl, S.relatedTarget = y, T = null, re(A) === g && (Z = new Z(
              v,
              o + "enter",
              H,
              a,
              A
            ), Z.target = y, Z.relatedTarget = vl, T = Z), vl = T, b && H)
              t: {
                for (Z = Vm, v = b, o = H, y = 0, T = v; T; T = Z(T))
                  y++;
                T = 0;
                for (var Q = o; Q; Q = Z(Q))
                  T++;
                for (; 0 < y - T; )
                  v = Z(v), y--;
                for (; 0 < T - y; )
                  o = Z(o), T--;
                for (; y--; ) {
                  if (v === o || o !== null && v === o.alternate) {
                    Z = v;
                    break t;
                  }
                  v = Z(v), o = Z(o);
                }
                Z = null;
              }
            else Z = null;
            b !== null && no(
              z,
              S,
              b,
              Z,
              !1
            ), H !== null && vl !== null && no(
              z,
              vl,
              H,
              Z,
              !0
            );
          }
        }
        l: {
          if (S = g ? lu(g) : window, b = S.nodeName && S.nodeName.toLowerCase(), b === "select" || b === "input" && S.type === "file")
            var nl = As;
          else if (ps(S))
            if (xs)
              nl = tm;
            else {
              nl = Ph;
              var G = Ih;
            }
          else
            b = S.nodeName, !b || b.toLowerCase() !== "input" || S.type !== "checkbox" && S.type !== "radio" ? g && _i(g.elementType) && (nl = As) : nl = lm;
          if (nl && (nl = nl(l, g))) {
            Es(
              z,
              nl,
              a,
              A
            );
            break l;
          }
          G && G(l, S, g), l === "focusout" && g && S.type === "number" && g.memoizedProps.value != null && ji(S, "number", S.value);
        }
        switch (G = g ? lu(g) : window, l) {
          case "focusin":
            (ps(G) || G.contentEditable === "true") && (be = G, Xi = g, su = null);
            break;
          case "focusout":
            su = Xi = be = null;
            break;
          case "mousedown":
            Li = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            Li = !1, Ms(z, a, A);
            break;
          case "selectionchange":
            if (em) break;
          case "keydown":
          case "keyup":
            Ms(z, a, A);
        }
        var W;
        if (qi)
          l: {
            switch (l) {
              case "compositionstart":
                var el = "onCompositionStart";
                break l;
              case "compositionend":
                el = "onCompositionEnd";
                break l;
              case "compositionupdate":
                el = "onCompositionUpdate";
                break l;
            }
            el = void 0;
          }
        else
          Se ? Ss(l, a) && (el = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (el = "onCompositionStart");
        el && (vs && a.locale !== "ko" && (Se || el !== "onCompositionStart" ? el === "onCompositionEnd" && Se && (W = rs()) : (da = A, Di = "value" in da ? da.value : da.textContent, Se = !0)), G = wn(g, el), 0 < G.length && (el = new hs(
          el,
          l,
          null,
          a,
          A
        ), z.push({ event: el, listeners: G }), W ? el.data = W : (W = bs(a), W !== null && (el.data = W)))), (W = wh ? kh(l, a) : Fh(l, a)) && (el = wn(g, "onBeforeInput"), 0 < el.length && (G = new hs(
          "onBeforeInput",
          "beforeinput",
          null,
          a,
          A
        ), z.push({
          event: G,
          listeners: el
        }), G.data = W)), Qm(
          z,
          l,
          g,
          a,
          A
        );
      }
      eo(z, t);
    });
  }
  function Ru(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function wn(l, t) {
    for (var a = t + "Capture", e = []; l !== null; ) {
      var u = l, n = u.stateNode;
      if (u = u.tag, u !== 5 && u !== 26 && u !== 27 || n === null || (u = tu(l, a), u != null && e.unshift(
        Ru(l, u, n)
      ), u = tu(l, t), u != null && e.push(
        Ru(l, u, n)
      )), l.tag === 3) return e;
      l = l.return;
    }
    return [];
  }
  function Vm(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function no(l, t, a, e, u) {
    for (var n = t._reactName, i = []; a !== null && a !== e; ) {
      var c = a, d = c.alternate, g = c.stateNode;
      if (c = c.tag, d !== null && d === e) break;
      c !== 5 && c !== 26 && c !== 27 || g === null || (d = g, u ? (g = tu(a, n), g != null && i.unshift(
        Ru(a, g, d)
      )) : u || (g = tu(a, n), g != null && i.push(
        Ru(a, g, d)
      ))), a = a.return;
    }
    i.length !== 0 && l.push({ event: t, listeners: i });
  }
  var Km = /\r\n?/g, Jm = /\u0000|\uFFFD/g;
  function io(l) {
    return (typeof l == "string" ? l : "" + l).replace(Km, `
`).replace(Jm, "");
  }
  function co(l, t) {
    return t = io(t), io(l) === t;
  }
  function ml(l, t, a, e, u, n) {
    switch (a) {
      case "children":
        typeof e == "string" ? t === "body" || t === "textarea" && e === "" || ve(l, e) : (typeof e == "number" || typeof e == "bigint") && t !== "body" && ve(l, "" + e);
        break;
      case "className":
        Wu(l, "class", e);
        break;
      case "tabIndex":
        Wu(l, "tabindex", e);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Wu(l, a, e);
        break;
      case "style":
        cs(l, e, n);
        break;
      case "data":
        if (t !== "object") {
          Wu(l, "data", e);
          break;
        }
      case "src":
      case "href":
        if (e === "" && (t !== "a" || a !== "href")) {
          l.removeAttribute(a);
          break;
        }
        if (e == null || typeof e == "function" || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Iu("" + e), l.setAttribute(a, e);
        break;
      case "action":
      case "formAction":
        if (typeof e == "function") {
          l.setAttribute(
            a,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof n == "function" && (a === "formAction" ? (t !== "input" && ml(l, t, "name", u.name, u, null), ml(
            l,
            t,
            "formEncType",
            u.formEncType,
            u,
            null
          ), ml(
            l,
            t,
            "formMethod",
            u.formMethod,
            u,
            null
          ), ml(
            l,
            t,
            "formTarget",
            u.formTarget,
            u,
            null
          )) : (ml(l, t, "encType", u.encType, u, null), ml(l, t, "method", u.method, u, null), ml(l, t, "target", u.target, u, null)));
        if (e == null || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Iu("" + e), l.setAttribute(a, e);
        break;
      case "onClick":
        e != null && (l.onclick = Kt);
        break;
      case "onScroll":
        e != null && ll("scroll", l);
        break;
      case "onScrollEnd":
        e != null && ll("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e))
            throw Error(r(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(r(60));
            l.innerHTML = a;
          }
        }
        break;
      case "multiple":
        l.multiple = e && typeof e != "function" && typeof e != "symbol";
        break;
      case "muted":
        l.muted = e && typeof e != "function" && typeof e != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (e == null || typeof e == "function" || typeof e == "boolean" || typeof e == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        a = Iu("" + e), l.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          a
        );
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "" + e) : l.removeAttribute(a);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        e && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "") : l.removeAttribute(a);
        break;
      case "capture":
      case "download":
        e === !0 ? l.setAttribute(a, "") : e !== !1 && e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        e != null && typeof e != "function" && typeof e != "symbol" && !isNaN(e) && 1 <= e ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "rowSpan":
      case "start":
        e == null || typeof e == "function" || typeof e == "symbol" || isNaN(e) ? l.removeAttribute(a) : l.setAttribute(a, e);
        break;
      case "popover":
        ll("beforetoggle", l), ll("toggle", l), Fu(l, "popover", e);
        break;
      case "xlinkActuate":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          e
        );
        break;
      case "xlinkArcrole":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          e
        );
        break;
      case "xlinkRole":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          e
        );
        break;
      case "xlinkShow":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          e
        );
        break;
      case "xlinkTitle":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          e
        );
        break;
      case "xlinkType":
        Vt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          e
        );
        break;
      case "xmlBase":
        Vt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          e
        );
        break;
      case "xmlLang":
        Vt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          e
        );
        break;
      case "xmlSpace":
        Vt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          e
        );
        break;
      case "is":
        Fu(l, "is", e);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = ph.get(a) || a, Fu(l, a, e));
    }
  }
  function mf(l, t, a, e, u, n) {
    switch (a) {
      case "style":
        cs(l, e, n);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e))
            throw Error(r(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(r(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof e == "string" ? ve(l, e) : (typeof e == "number" || typeof e == "bigint") && ve(l, "" + e);
        break;
      case "onScroll":
        e != null && ll("scroll", l);
        break;
      case "onScrollEnd":
        e != null && ll("scrollend", l);
        break;
      case "onClick":
        e != null && (l.onclick = Kt);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!If.hasOwnProperty(a))
          l: {
            if (a[0] === "o" && a[1] === "n" && (u = a.endsWith("Capture"), t = a.slice(2, u ? a.length - 7 : void 0), n = l[et] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, u), typeof e == "function")) {
              typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, e, u);
              break l;
            }
            a in l ? l[a] = e : e === !0 ? l.setAttribute(a, "") : Fu(l, a, e);
          }
    }
  }
  function wl(l, t, a) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        ll("error", l), ll("load", l);
        var e = !1, u = !1, n;
        for (n in a)
          if (a.hasOwnProperty(n)) {
            var i = a[n];
            if (i != null)
              switch (n) {
                case "src":
                  e = !0;
                  break;
                case "srcSet":
                  u = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(r(137, t));
                default:
                  ml(l, t, n, i, a, null);
              }
          }
        u && ml(l, t, "srcSet", a.srcSet, a, null), e && ml(l, t, "src", a.src, a, null);
        return;
      case "input":
        ll("invalid", l);
        var c = n = i = u = null, d = null, g = null;
        for (e in a)
          if (a.hasOwnProperty(e)) {
            var A = a[e];
            if (A != null)
              switch (e) {
                case "name":
                  u = A;
                  break;
                case "type":
                  i = A;
                  break;
                case "checked":
                  d = A;
                  break;
                case "defaultChecked":
                  g = A;
                  break;
                case "value":
                  n = A;
                  break;
                case "defaultValue":
                  c = A;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (A != null)
                    throw Error(r(137, t));
                  break;
                default:
                  ml(l, t, e, A, a, null);
              }
          }
        es(
          l,
          n,
          c,
          d,
          g,
          i,
          u,
          !1
        );
        return;
      case "select":
        ll("invalid", l), e = i = n = null;
        for (u in a)
          if (a.hasOwnProperty(u) && (c = a[u], c != null))
            switch (u) {
              case "value":
                n = c;
                break;
              case "defaultValue":
                i = c;
                break;
              case "multiple":
                e = c;
              default:
                ml(l, t, u, c, a, null);
            }
        t = n, a = i, l.multiple = !!e, t != null ? me(l, !!e, t, !1) : a != null && me(l, !!e, a, !0);
        return;
      case "textarea":
        ll("invalid", l), n = u = e = null;
        for (i in a)
          if (a.hasOwnProperty(i) && (c = a[i], c != null))
            switch (i) {
              case "value":
                e = c;
                break;
              case "defaultValue":
                u = c;
                break;
              case "children":
                n = c;
                break;
              case "dangerouslySetInnerHTML":
                if (c != null) throw Error(r(91));
                break;
              default:
                ml(l, t, i, c, a, null);
            }
        ns(l, e, u, n);
        return;
      case "option":
        for (d in a)
          a.hasOwnProperty(d) && (e = a[d], e != null) && (d === "selected" ? l.selected = e && typeof e != "function" && typeof e != "symbol" : ml(l, t, d, e, a, null));
        return;
      case "dialog":
        ll("beforetoggle", l), ll("toggle", l), ll("cancel", l), ll("close", l);
        break;
      case "iframe":
      case "object":
        ll("load", l);
        break;
      case "video":
      case "audio":
        for (e = 0; e < Cu.length; e++)
          ll(Cu[e], l);
        break;
      case "image":
        ll("error", l), ll("load", l);
        break;
      case "details":
        ll("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        ll("error", l), ll("load", l);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (g in a)
          if (a.hasOwnProperty(g) && (e = a[g], e != null))
            switch (g) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(r(137, t));
              default:
                ml(l, t, g, e, a, null);
            }
        return;
      default:
        if (_i(t)) {
          for (A in a)
            a.hasOwnProperty(A) && (e = a[A], e !== void 0 && mf(
              l,
              t,
              A,
              e,
              a,
              void 0
            ));
          return;
        }
    }
    for (c in a)
      a.hasOwnProperty(c) && (e = a[c], e != null && ml(l, t, c, e, a, null));
  }
  function wm(l, t, a, e) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var u = null, n = null, i = null, c = null, d = null, g = null, A = null;
        for (b in a) {
          var z = a[b];
          if (a.hasOwnProperty(b) && z != null)
            switch (b) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                d = z;
              default:
                e.hasOwnProperty(b) || ml(l, t, b, null, e, z);
            }
        }
        for (var S in e) {
          var b = e[S];
          if (z = a[S], e.hasOwnProperty(S) && (b != null || z != null))
            switch (S) {
              case "type":
                n = b;
                break;
              case "name":
                u = b;
                break;
              case "checked":
                g = b;
                break;
              case "defaultChecked":
                A = b;
                break;
              case "value":
                i = b;
                break;
              case "defaultValue":
                c = b;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (b != null)
                  throw Error(r(137, t));
                break;
              default:
                b !== z && ml(
                  l,
                  t,
                  S,
                  b,
                  e,
                  z
                );
            }
        }
        zi(
          l,
          i,
          c,
          d,
          g,
          A,
          n,
          u
        );
        return;
      case "select":
        b = i = c = S = null;
        for (n in a)
          if (d = a[n], a.hasOwnProperty(n) && d != null)
            switch (n) {
              case "value":
                break;
              case "multiple":
                b = d;
              default:
                e.hasOwnProperty(n) || ml(
                  l,
                  t,
                  n,
                  null,
                  e,
                  d
                );
            }
        for (u in e)
          if (n = e[u], d = a[u], e.hasOwnProperty(u) && (n != null || d != null))
            switch (u) {
              case "value":
                S = n;
                break;
              case "defaultValue":
                c = n;
                break;
              case "multiple":
                i = n;
              default:
                n !== d && ml(
                  l,
                  t,
                  u,
                  n,
                  e,
                  d
                );
            }
        t = c, a = i, e = b, S != null ? me(l, !!a, S, !1) : !!e != !!a && (t != null ? me(l, !!a, t, !0) : me(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        b = S = null;
        for (c in a)
          if (u = a[c], a.hasOwnProperty(c) && u != null && !e.hasOwnProperty(c))
            switch (c) {
              case "value":
                break;
              case "children":
                break;
              default:
                ml(l, t, c, null, e, u);
            }
        for (i in e)
          if (u = e[i], n = a[i], e.hasOwnProperty(i) && (u != null || n != null))
            switch (i) {
              case "value":
                S = u;
                break;
              case "defaultValue":
                b = u;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (u != null) throw Error(r(91));
                break;
              default:
                u !== n && ml(l, t, i, u, e, n);
            }
        us(l, S, b);
        return;
      case "option":
        for (var H in a)
          S = a[H], a.hasOwnProperty(H) && S != null && !e.hasOwnProperty(H) && (H === "selected" ? l.selected = !1 : ml(
            l,
            t,
            H,
            null,
            e,
            S
          ));
        for (d in e)
          S = e[d], b = a[d], e.hasOwnProperty(d) && S !== b && (S != null || b != null) && (d === "selected" ? l.selected = S && typeof S != "function" && typeof S != "symbol" : ml(
            l,
            t,
            d,
            S,
            e,
            b
          ));
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var Z in a)
          S = a[Z], a.hasOwnProperty(Z) && S != null && !e.hasOwnProperty(Z) && ml(l, t, Z, null, e, S);
        for (g in e)
          if (S = e[g], b = a[g], e.hasOwnProperty(g) && S !== b && (S != null || b != null))
            switch (g) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (S != null)
                  throw Error(r(137, t));
                break;
              default:
                ml(
                  l,
                  t,
                  g,
                  S,
                  e,
                  b
                );
            }
        return;
      default:
        if (_i(t)) {
          for (var vl in a)
            S = a[vl], a.hasOwnProperty(vl) && S !== void 0 && !e.hasOwnProperty(vl) && mf(
              l,
              t,
              vl,
              void 0,
              e,
              S
            );
          for (A in e)
            S = e[A], b = a[A], !e.hasOwnProperty(A) || S === b || S === void 0 && b === void 0 || mf(
              l,
              t,
              A,
              S,
              e,
              b
            );
          return;
        }
    }
    for (var v in a)
      S = a[v], a.hasOwnProperty(v) && S != null && !e.hasOwnProperty(v) && ml(l, t, v, null, e, S);
    for (z in e)
      S = e[z], b = a[z], !e.hasOwnProperty(z) || S === b || S == null && b == null || ml(l, t, z, S, e, b);
  }
  function fo(l) {
    switch (l) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return !0;
      default:
        return !1;
    }
  }
  function km() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), e = 0; e < a.length; e++) {
        var u = a[e], n = u.transferSize, i = u.initiatorType, c = u.duration;
        if (n && c && fo(i)) {
          for (i = 0, c = u.responseEnd, e += 1; e < a.length; e++) {
            var d = a[e], g = d.startTime;
            if (g > c) break;
            var A = d.transferSize, z = d.initiatorType;
            A && fo(z) && (d = d.responseEnd, i += A * (d < c ? 1 : (c - g) / (d - g)));
          }
          if (--e, t += 8 * (n + i) / (u.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var vf = null, yf = null;
  function kn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function so(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function ro(l, t) {
    if (l === 0)
      switch (t) {
        case "svg":
          return 1;
        case "math":
          return 2;
        default:
          return 0;
      }
    return l === 1 && t === "foreignObject" ? 0 : l;
  }
  function gf(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Sf = null;
  function Fm() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Sf ? !1 : (Sf = l, !0) : (Sf = null, !1);
  }
  var oo = typeof setTimeout == "function" ? setTimeout : void 0, Wm = typeof clearTimeout == "function" ? clearTimeout : void 0, ho = typeof Promise == "function" ? Promise : void 0, $m = typeof queueMicrotask == "function" ? queueMicrotask : typeof ho < "u" ? function(l) {
    return ho.resolve(null).then(l).catch(Im);
  } : oo;
  function Im(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function Oa(l) {
    return l === "head";
  }
  function mo(l, t) {
    var a = t, e = 0;
    do {
      var u = a.nextSibling;
      if (l.removeChild(a), u && u.nodeType === 8)
        if (a = u.data, a === "/$" || a === "/&") {
          if (e === 0) {
            l.removeChild(u), Je(t);
            return;
          }
          e--;
        } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&")
          e++;
        else if (a === "html")
          Hu(l.ownerDocument.documentElement);
        else if (a === "head") {
          a = l.ownerDocument.head, Hu(a);
          for (var n = a.firstChild; n; ) {
            var i = n.nextSibling, c = n.nodeName;
            n[Pe] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
          }
        } else
          a === "body" && Hu(l.ownerDocument.body);
      a = u;
    } while (a);
    Je(t);
  }
  function vo(l, t) {
    var a = l;
    l = 0;
    do {
      var e = a.nextSibling;
      if (a.nodeType === 1 ? t ? (a._stashedDisplay = a.style.display, a.style.display = "none") : (a.style.display = a._stashedDisplay || "", a.getAttribute("style") === "" && a.removeAttribute("style")) : a.nodeType === 3 && (t ? (a._stashedText = a.nodeValue, a.nodeValue = "") : a.nodeValue = a._stashedText || ""), e && e.nodeType === 8)
        if (a = e.data, a === "/$") {
          if (l === 0) break;
          l--;
        } else
          a !== "$" && a !== "$?" && a !== "$~" && a !== "$!" || l++;
      a = e;
    } while (a);
  }
  function bf(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          bf(a), xi(a);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (a.rel.toLowerCase() === "stylesheet") continue;
      }
      l.removeChild(a);
    }
  }
  function Pm(l, t, a, e) {
    for (; l.nodeType === 1; ) {
      var u = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!e && (l.nodeName !== "INPUT" || l.type !== "hidden"))
          break;
      } else if (e) {
        if (!l[Pe])
          switch (t) {
            case "meta":
              if (!l.hasAttribute("itemprop")) break;
              return l;
            case "link":
              if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence"))
                break;
              if (n !== u.rel || l.getAttribute("href") !== (u.href == null || u.href === "" ? null : u.href) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin) || l.getAttribute("title") !== (u.title == null ? null : u.title))
                break;
              return l;
            case "style":
              if (l.hasAttribute("data-precedence")) break;
              return l;
            case "script":
              if (n = l.getAttribute("src"), (n !== (u.src == null ? null : u.src) || l.getAttribute("type") !== (u.type == null ? null : u.type) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop"))
                break;
              return l;
            default:
              return l;
          }
      } else if (t === "input" && l.type === "hidden") {
        var n = u.name == null ? null : "" + u.name;
        if (u.type === "hidden" && l.getAttribute("name") === n)
          return l;
      } else return l;
      if (l = Nt(l.nextSibling), l === null) break;
    }
    return null;
  }
  function l0(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = Nt(l.nextSibling), l === null)) return null;
    return l;
  }
  function yo(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = Nt(l.nextSibling), l === null)) return null;
    return l;
  }
  function pf(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function Ef(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function t0(l, t) {
    var a = l.ownerDocument;
    if (l.data === "$~") l._reactRetry = t;
    else if (l.data !== "$?" || a.readyState !== "loading")
      t();
    else {
      var e = function() {
        t(), a.removeEventListener("DOMContentLoaded", e);
      };
      a.addEventListener("DOMContentLoaded", e), l._reactRetry = e;
    }
  }
  function Nt(l) {
    for (; l != null; l = l.nextSibling) {
      var t = l.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = l.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F")
          break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return l;
  }
  var Af = null;
  function go(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0)
            return Nt(l.nextSibling);
          t--;
        } else
          a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function So(l) {
    l = l.previousSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "$" || a === "$!" || a === "$?" || a === "$~" || a === "&") {
          if (t === 0) return l;
          t--;
        } else a !== "/$" && a !== "/&" || t++;
      }
      l = l.previousSibling;
    }
    return null;
  }
  function bo(l, t, a) {
    switch (t = kn(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(r(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(r(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(r(454));
        return l;
      default:
        throw Error(r(451));
    }
  }
  function Hu(l) {
    for (var t = l.attributes; t.length; )
      l.removeAttributeNode(t[0]);
    xi(l);
  }
  var Ut = /* @__PURE__ */ new Map(), po = /* @__PURE__ */ new Set();
  function Fn(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var ca = D.d;
  D.d = {
    f: a0,
    r: e0,
    D: u0,
    C: n0,
    L: i0,
    m: c0,
    X: s0,
    S: f0,
    M: r0
  };
  function a0() {
    var l = ca.f(), t = Qn();
    return l || t;
  }
  function e0(l) {
    var t = de(l);
    t !== null && t.tag === 5 && t.type === "form" ? Br(t) : ca.r(l);
  }
  var Ze = typeof document > "u" ? null : document;
  function Eo(l, t, a) {
    var e = Ze;
    if (e && typeof t == "string" && t) {
      var u = At(t);
      u = 'link[rel="' + l + '"][href="' + u + '"]', typeof a == "string" && (u += '[crossorigin="' + a + '"]'), po.has(u) || (po.add(u), l = { rel: l, crossOrigin: a, href: t }, e.querySelector(u) === null && (t = e.createElement("link"), wl(t, "link", l), Gl(t), e.head.appendChild(t)));
    }
  }
  function u0(l) {
    ca.D(l), Eo("dns-prefetch", l, null);
  }
  function n0(l, t) {
    ca.C(l, t), Eo("preconnect", l, t);
  }
  function i0(l, t, a) {
    ca.L(l, t, a);
    var e = Ze;
    if (e && l && t) {
      var u = 'link[rel="preload"][as="' + At(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (u += '[imagesrcset="' + At(
        a.imageSrcSet
      ) + '"]', typeof a.imageSizes == "string" && (u += '[imagesizes="' + At(
        a.imageSizes
      ) + '"]')) : u += '[href="' + At(l) + '"]';
      var n = u;
      switch (t) {
        case "style":
          n = Ve(l);
          break;
        case "script":
          n = Ke(l);
      }
      Ut.has(n) || (l = N(
        {
          rel: "preload",
          href: t === "image" && a && a.imageSrcSet ? void 0 : l,
          as: t
        },
        a
      ), Ut.set(n, l), e.querySelector(u) !== null || t === "style" && e.querySelector(Bu(n)) || t === "script" && e.querySelector(qu(n)) || (t = e.createElement("link"), wl(t, "link", l), Gl(t), e.head.appendChild(t)));
    }
  }
  function c0(l, t) {
    ca.m(l, t);
    var a = Ze;
    if (a && l) {
      var e = t && typeof t.as == "string" ? t.as : "script", u = 'link[rel="modulepreload"][as="' + At(e) + '"][href="' + At(l) + '"]', n = u;
      switch (e) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Ke(l);
      }
      if (!Ut.has(n) && (l = N({ rel: "modulepreload", href: l }, t), Ut.set(n, l), a.querySelector(u) === null)) {
        switch (e) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(qu(n)))
              return;
        }
        e = a.createElement("link"), wl(e, "link", l), Gl(e), a.head.appendChild(e);
      }
    }
  }
  function f0(l, t, a) {
    ca.S(l, t, a);
    var e = Ze;
    if (e && l) {
      var u = oe(e).hoistableStyles, n = Ve(l);
      t = t || "default";
      var i = u.get(n);
      if (!i) {
        var c = { loading: 0, preload: null };
        if (i = e.querySelector(
          Bu(n)
        ))
          c.loading = 5;
        else {
          l = N(
            { rel: "stylesheet", href: l, "data-precedence": t },
            a
          ), (a = Ut.get(n)) && xf(l, a);
          var d = i = e.createElement("link");
          Gl(d), wl(d, "link", l), d._p = new Promise(function(g, A) {
            d.onload = g, d.onerror = A;
          }), d.addEventListener("load", function() {
            c.loading |= 1;
          }), d.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Wn(i, t, e);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: c
        }, u.set(n, i);
      }
    }
  }
  function s0(l, t) {
    ca.X(l, t);
    var a = Ze;
    if (a && l) {
      var e = oe(a).hoistableScripts, u = Ke(l), n = e.get(u);
      n || (n = a.querySelector(qu(u)), n || (l = N({ src: l, async: !0 }, t), (t = Ut.get(u)) && Tf(l, t), n = a.createElement("script"), Gl(n), wl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function r0(l, t) {
    ca.M(l, t);
    var a = Ze;
    if (a && l) {
      var e = oe(a).hoistableScripts, u = Ke(l), n = e.get(u);
      n || (n = a.querySelector(qu(u)), n || (l = N({ src: l, async: !0, type: "module" }, t), (t = Ut.get(u)) && Tf(l, t), n = a.createElement("script"), Gl(n), wl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function Ao(l, t, a, e) {
    var u = (u = $.current) ? Fn(u) : null;
    if (!u) throw Error(r(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Ve(a.href), a = oe(
          u
        ).hoistableStyles, e = a.get(t), e || (e = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (a.rel === "stylesheet" && typeof a.href == "string" && typeof a.precedence == "string") {
          l = Ve(a.href);
          var n = oe(
            u
          ).hoistableStyles, i = n.get(l);
          if (i || (u = u.ownerDocument || u, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, n.set(l, i), (n = u.querySelector(
            Bu(l)
          )) && !n._p && (i.instance = n, i.state.loading = 5), Ut.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Ut.set(l, a), n || d0(
            u,
            l,
            a,
            i.state
          ))), t && e === null)
            throw Error(r(528, ""));
          return i;
        }
        if (t && e !== null)
          throw Error(r(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Ke(a), a = oe(
          u
        ).hoistableScripts, e = a.get(t), e || (e = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(r(444, l));
    }
  }
  function Ve(l) {
    return 'href="' + At(l) + '"';
  }
  function Bu(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function xo(l) {
    return N({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function d0(l, t, a, e) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? e.loading = 1 : (t = l.createElement("link"), e.preload = t, t.addEventListener("load", function() {
      return e.loading |= 1;
    }), t.addEventListener("error", function() {
      return e.loading |= 2;
    }), wl(t, "link", a), Gl(t), l.head.appendChild(t));
  }
  function Ke(l) {
    return '[src="' + At(l) + '"]';
  }
  function qu(l) {
    return "script[async]" + l;
  }
  function To(l, t, a) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var e = l.querySelector(
            'style[data-href~="' + At(a.href) + '"]'
          );
          if (e)
            return t.instance = e, Gl(e), e;
          var u = N({}, a, {
            "data-href": a.href,
            "data-precedence": a.precedence,
            href: null,
            precedence: null
          });
          return e = (l.ownerDocument || l).createElement(
            "style"
          ), Gl(e), wl(e, "style", u), Wn(e, a.precedence, l), t.instance = e;
        case "stylesheet":
          u = Ve(a.href);
          var n = l.querySelector(
            Bu(u)
          );
          if (n)
            return t.state.loading |= 4, t.instance = n, Gl(n), n;
          e = xo(a), (u = Ut.get(u)) && xf(e, u), n = (l.ownerDocument || l).createElement("link"), Gl(n);
          var i = n;
          return i._p = new Promise(function(c, d) {
            i.onload = c, i.onerror = d;
          }), wl(n, "link", e), t.state.loading |= 4, Wn(n, a.precedence, l), t.instance = n;
        case "script":
          return n = Ke(a.src), (u = l.querySelector(
            qu(n)
          )) ? (t.instance = u, Gl(u), u) : (e = a, (u = Ut.get(n)) && (e = N({}, a), Tf(e, u)), l = l.ownerDocument || l, u = l.createElement("script"), Gl(u), wl(u, "link", e), l.head.appendChild(u), t.instance = u);
        case "void":
          return null;
        default:
          throw Error(r(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (e = t.instance, t.state.loading |= 4, Wn(e, a.precedence, l));
    return t.instance;
  }
  function Wn(l, t, a) {
    for (var e = a.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), u = e.length ? e[e.length - 1] : null, n = u, i = 0; i < e.length; i++) {
      var c = e[i];
      if (c.dataset.precedence === t) n = c;
      else if (n !== u) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function xf(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.title == null && (l.title = t.title);
  }
  function Tf(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.integrity == null && (l.integrity = t.integrity);
  }
  var $n = null;
  function zo(l, t, a) {
    if ($n === null) {
      var e = /* @__PURE__ */ new Map(), u = $n = /* @__PURE__ */ new Map();
      u.set(a, e);
    } else
      u = $n, e = u.get(a), e || (e = /* @__PURE__ */ new Map(), u.set(a, e));
    if (e.has(l)) return e;
    for (e.set(l, null), a = a.getElementsByTagName(l), u = 0; u < a.length; u++) {
      var n = a[u];
      if (!(n[Pe] || n[Zl] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var c = e.get(i);
        c ? c.push(n) : e.set(i, [n]);
      }
    }
    return e;
  }
  function jo(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(
      a,
      t === "title" ? l.querySelector("head > title") : null
    );
  }
  function o0(l, t, a) {
    if (a === 1 || t.itemProp != null) return !1;
    switch (l) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "")
          break;
        return !0;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError)
          break;
        return t.rel === "stylesheet" ? (l = t.disabled, typeof t.precedence == "string" && l == null) : !0;
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string")
          return !0;
    }
    return !1;
  }
  function _o(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function h0(l, t, a, e) {
    if (a.type === "stylesheet" && (typeof e.media != "string" || matchMedia(e.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var u = Ve(e.href), n = t.querySelector(
          Bu(u)
        );
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = In.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Gl(n);
          return;
        }
        n = t.ownerDocument || t, e = xo(e), (u = Ut.get(u)) && xf(e, u), n = n.createElement("link"), Gl(n);
        var i = n;
        i._p = new Promise(function(c, d) {
          i.onload = c, i.onerror = d;
        }), wl(n, "link", e), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = In.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var zf = 0;
  function m0(l, t) {
    return l.stylesheets && l.count === 0 && li(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var e = setTimeout(function() {
        if (l.stylesheets && li(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && zf === 0 && (zf = 62500 * km());
      var u = setTimeout(
        function() {
          if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && li(l, l.stylesheets), l.unsuspend)) {
            var n = l.unsuspend;
            l.unsuspend = null, n();
          }
        },
        (l.imgBytes > zf ? 50 : 800) + t
      );
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(e), clearTimeout(u);
      };
    } : null;
  }
  function In() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) li(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Pn = null;
  function li(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Pn = /* @__PURE__ */ new Map(), t.forEach(v0, l), Pn = null, In.call(l));
  }
  function v0(l, t) {
    if (!(t.state.loading & 4)) {
      var a = Pn.get(l);
      if (a) var e = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), Pn.set(l, a);
        for (var u = l.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), n = 0; n < u.length; n++) {
          var i = u[n];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), e = i);
        }
        e && a.set(null, e);
      }
      u = t.instance, i = u.getAttribute("data-precedence"), n = a.get(i) || e, n === e && a.set(null, u), a.set(i, u), this.count++, e = In.bind(this), u.addEventListener("load", e), u.addEventListener("error", e), n ? n.parentNode.insertBefore(u, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(u, l.firstChild)), t.state.loading |= 4;
    }
  }
  var Yu = {
    $$typeof: xl,
    Provider: null,
    Consumer: null,
    _currentValue: V,
    _currentValue2: V,
    _threadCount: 0
  };
  function y0(l, t, a, e, u, n, i, c, d) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = bi(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = bi(0), this.hiddenUpdates = bi(null), this.identifierPrefix = e, this.onUncaughtError = u, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = d, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Oo(l, t, a, e, u, n, i, c, d, g, A, z) {
    return l = new y0(
      l,
      t,
      a,
      i,
      d,
      g,
      A,
      z,
      c
    ), t = 1, n === !0 && (t |= 24), n = ht(3, null, null, t), l.current = n, n.stateNode = l, t = ec(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: e,
      isDehydrated: a,
      cache: t
    }, cc(n), l;
  }
  function No(l) {
    return l ? (l = Ae, l) : Ae;
  }
  function Uo(l, t, a, e, u, n) {
    u = No(u), e.context === null ? e.context = u : e.pendingContext = u, e = ga(t), e.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (e.callback = n), a = Sa(l, e, t), a !== null && (st(a, l, t), yu(a, l, t));
  }
  function Mo(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function jf(l, t) {
    Mo(l, t), (l = l.alternate) && Mo(l, t);
  }
  function Do(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Ja(l, 67108864);
      t !== null && st(t, l, 67108864), jf(l, 67108864);
    }
  }
  function Co(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = St();
      t = pi(t);
      var a = Ja(l, t);
      a !== null && st(a, l, t), jf(l, t);
    }
  }
  var ti = !0;
  function g0(l, t, a, e) {
    var u = x.T;
    x.T = null;
    var n = D.p;
    try {
      D.p = 2, _f(l, t, a, e);
    } finally {
      D.p = n, x.T = u;
    }
  }
  function S0(l, t, a, e) {
    var u = x.T;
    x.T = null;
    var n = D.p;
    try {
      D.p = 8, _f(l, t, a, e);
    } finally {
      D.p = n, x.T = u;
    }
  }
  function _f(l, t, a, e) {
    if (ti) {
      var u = Of(e);
      if (u === null)
        hf(
          l,
          t,
          e,
          ai,
          a
        ), Ho(l, e);
      else if (p0(
        u,
        l,
        t,
        a,
        e
      ))
        e.stopPropagation();
      else if (Ho(l, e), t & 4 && -1 < b0.indexOf(l)) {
        for (; u !== null; ) {
          var n = de(u);
          if (n !== null)
            switch (n.tag) {
              case 3:
                if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                  var i = pt(n.pendingLanes);
                  if (i !== 0) {
                    var c = n;
                    for (c.pendingLanes |= 2, c.entangledLanes |= 2; i; ) {
                      var d = 1 << 31 - _l(i);
                      c.entanglements[1] |= d, i &= ~d;
                    }
                    Lt(n), (fl & 6) === 0 && (Yn = Il() + 500, Du(0));
                  }
                }
                break;
              case 31:
              case 13:
                c = Ja(n, 2), c !== null && st(c, n, 2), Qn(), jf(n, 2);
            }
          if (n = Of(e), n === null && hf(
            l,
            t,
            e,
            ai,
            a
          ), n === u) break;
          u = n;
        }
        u !== null && e.stopPropagation();
      } else
        hf(
          l,
          t,
          e,
          null,
          a
        );
    }
  }
  function Of(l) {
    return l = Ni(l), Nf(l);
  }
  var ai = null;
  function Nf(l) {
    if (ai = null, l = re(l), l !== null) {
      var t = C(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = R(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = B(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return ai = l, null;
  }
  function Ro(l) {
    switch (l) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (oi()) {
          case Ku:
            return 2;
          case Ju:
            return 8;
          case ie:
          case hi:
            return 32;
          case wu:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Uf = !1, Na = null, Ua = null, Ma = null, Gu = /* @__PURE__ */ new Map(), Qu = /* @__PURE__ */ new Map(), Da = [], b0 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function Ho(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        Na = null;
        break;
      case "dragenter":
      case "dragleave":
        Ua = null;
        break;
      case "mouseover":
      case "mouseout":
        Ma = null;
        break;
      case "pointerover":
      case "pointerout":
        Gu.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Qu.delete(t.pointerId);
    }
  }
  function Xu(l, t, a, e, u, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: e,
      nativeEvent: n,
      targetContainers: [u]
    }, t !== null && (t = de(t), t !== null && Do(t)), l) : (l.eventSystemFlags |= e, t = l.targetContainers, u !== null && t.indexOf(u) === -1 && t.push(u), l);
  }
  function p0(l, t, a, e, u) {
    switch (t) {
      case "focusin":
        return Na = Xu(
          Na,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "dragenter":
        return Ua = Xu(
          Ua,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "mouseover":
        return Ma = Xu(
          Ma,
          l,
          t,
          a,
          e,
          u
        ), !0;
      case "pointerover":
        var n = u.pointerId;
        return Gu.set(
          n,
          Xu(
            Gu.get(n) || null,
            l,
            t,
            a,
            e,
            u
          )
        ), !0;
      case "gotpointercapture":
        return n = u.pointerId, Qu.set(
          n,
          Xu(
            Qu.get(n) || null,
            l,
            t,
            a,
            e,
            u
          )
        ), !0;
    }
    return !1;
  }
  function Bo(l) {
    var t = re(l.target);
    if (t !== null) {
      var a = C(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = R(a), t !== null) {
            l.blockedOn = t, Ff(l.priority, function() {
              Co(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = B(a), t !== null) {
            l.blockedOn = t, Ff(l.priority, function() {
              Co(a);
            });
            return;
          }
        } else if (t === 3 && a.stateNode.current.memoizedState.isDehydrated) {
          l.blockedOn = a.tag === 3 ? a.stateNode.containerInfo : null;
          return;
        }
      }
    }
    l.blockedOn = null;
  }
  function ei(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = Of(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var e = new a.constructor(
          a.type,
          a
        );
        Oi = e, a.target.dispatchEvent(e), Oi = null;
      } else
        return t = de(a), t !== null && Do(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function qo(l, t, a) {
    ei(l) && a.delete(t);
  }
  function E0() {
    Uf = !1, Na !== null && ei(Na) && (Na = null), Ua !== null && ei(Ua) && (Ua = null), Ma !== null && ei(Ma) && (Ma = null), Gu.forEach(qo), Qu.forEach(qo);
  }
  function ui(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Uf || (Uf = !0, s.unstable_scheduleCallback(
      s.unstable_NormalPriority,
      E0
    )));
  }
  var ni = null;
  function Yo(l) {
    ni !== l && (ni = l, s.unstable_scheduleCallback(
      s.unstable_NormalPriority,
      function() {
        ni === l && (ni = null);
        for (var t = 0; t < l.length; t += 3) {
          var a = l[t], e = l[t + 1], u = l[t + 2];
          if (typeof e != "function") {
            if (Nf(e || a) === null)
              continue;
            break;
          }
          var n = de(a);
          n !== null && (l.splice(t, 3), t -= 3, _c(
            n,
            {
              pending: !0,
              data: u,
              method: a.method,
              action: e
            },
            e,
            u
          ));
        }
      }
    ));
  }
  function Je(l) {
    function t(d) {
      return ui(d, l);
    }
    Na !== null && ui(Na, l), Ua !== null && ui(Ua, l), Ma !== null && ui(Ma, l), Gu.forEach(t), Qu.forEach(t);
    for (var a = 0; a < Da.length; a++) {
      var e = Da[a];
      e.blockedOn === l && (e.blockedOn = null);
    }
    for (; 0 < Da.length && (a = Da[0], a.blockedOn === null); )
      Bo(a), a.blockedOn === null && Da.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null)
      for (e = 0; e < a.length; e += 3) {
        var u = a[e], n = a[e + 1], i = u[et] || null;
        if (typeof n == "function")
          i || Yo(a);
        else if (i) {
          var c = null;
          if (n && n.hasAttribute("formAction")) {
            if (u = n, i = n[et] || null)
              c = i.formAction;
            else if (Nf(u) !== null) continue;
          } else c = i.action;
          typeof c == "function" ? a[e + 1] = c : (a.splice(e, 3), e -= 3), Yo(a);
        }
      }
  }
  function Go() {
    function l(n) {
      n.canIntercept && n.info === "react-transition" && n.intercept({
        handler: function() {
          return new Promise(function(i) {
            return u = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      u !== null && (u(), u = null), e || setTimeout(a, 20);
    }
    function a() {
      if (!e && !navigation.transition) {
        var n = navigation.currentEntry;
        n && n.url != null && navigation.navigate(n.url, {
          state: n.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var e = !1, u = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        e = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), u !== null && (u(), u = null);
      };
    }
  }
  function Mf(l) {
    this._internalRoot = l;
  }
  ii.prototype.render = Mf.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(r(409));
    var a = t.current, e = St();
    Uo(a, e, l, t, null, null);
  }, ii.prototype.unmount = Mf.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      Uo(l.current, 2, null, l, null, null), Qn(), t[se] = null;
    }
  };
  function ii(l) {
    this._internalRoot = l;
  }
  ii.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = kf();
      l = { blockedOn: null, target: l, priority: t };
      for (var a = 0; a < Da.length && t !== 0 && t < Da[a].priority; a++) ;
      Da.splice(a, 0, l), a === 0 && Bo(l);
    }
  };
  var Qo = m.version;
  if (Qo !== "19.2.4")
    throw Error(
      r(
        527,
        Qo,
        "19.2.4"
      )
    );
  D.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(r(188)) : (l = Object.keys(l).join(","), Error(r(268, l)));
    return l = p(t), l = l !== null ? X(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var A0 = {
    bundleType: 0,
    version: "19.2.4",
    rendererPackageName: "react-dom",
    currentDispatcherRef: x,
    reconcilerVersion: "19.2.4"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var ci = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!ci.isDisabled && ci.supportsFiber)
      try {
        Qa = ci.inject(
          A0
        ), L = ci;
      } catch {
      }
  }
  return Zu.createRoot = function(l, t) {
    if (!O(l)) throw Error(r(299));
    var a = !1, e = "", u = Jr, n = wr, i = kr;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (e = t.identifierPrefix), t.onUncaughtError !== void 0 && (u = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = Oo(
      l,
      1,
      !1,
      null,
      null,
      a,
      e,
      null,
      u,
      n,
      i,
      Go
    ), l[se] = t.current, of(l), new Mf(t);
  }, Zu.hydrateRoot = function(l, t, a) {
    if (!O(l)) throw Error(r(299));
    var e = !1, u = "", n = Jr, i = wr, c = kr, d = null;
    return a != null && (a.unstable_strictMode === !0 && (e = !0), a.identifierPrefix !== void 0 && (u = a.identifierPrefix), a.onUncaughtError !== void 0 && (n = a.onUncaughtError), a.onCaughtError !== void 0 && (i = a.onCaughtError), a.onRecoverableError !== void 0 && (c = a.onRecoverableError), a.formState !== void 0 && (d = a.formState)), t = Oo(
      l,
      1,
      !0,
      t,
      a ?? null,
      e,
      u,
      d,
      n,
      i,
      c,
      Go
    ), t.context = No(null), a = t.current, e = St(), e = pi(e), u = ga(e), u.callback = null, Sa(a, u, e), a = e, t.current.lanes = a, Ie(t, a), Lt(t), l[se] = t.current, of(l), new ii(t);
  }, Zu.version = "19.2.4", Zu;
}
var Wo;
function D0() {
  if (Wo) return Rf.exports;
  Wo = 1;
  function s() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(s);
      } catch (m) {
        console.error(m);
      }
  }
  return s(), Rf.exports = M0(), Rf.exports;
}
var C0 = D0();
const Yf = "hana.plugin.ui", Gf = 1, R0 = "X-Hana-Plugin-Surface-Session", H0 = "pluginSurfaceSession", ch = {
  BAD_MESSAGE: "BAD_MESSAGE",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION"
}, Ra = {
  TOAST_SHOW: "toast.show",
  EXTERNAL_OPEN: "external.open",
  RESOURCE_OPEN: "resource.open",
  RESOURCE_PICK: "resource.pick",
  RESOURCE_REQUEST_ACCESS: "resource.requestAccess",
  UI_RESIZE: "ui.resize",
  PLUGIN_PAGE_OPEN: "plugin.page.open",
  CLIPBOARD_WRITE_TEXT: "clipboard.writeText"
}, B0 = /* @__PURE__ */ new Set([
  "event",
  "request",
  "response",
  "error"
]);
function $o(s) {
  return typeof s == "object" && s !== null;
}
function Ha(s) {
  return {
    ok: !1,
    error: {
      code: ch.BAD_MESSAGE,
      message: s
    }
  };
}
function Io(s) {
  if (!$o(s))
    return Ha("Plugin UI messages must be objects.");
  if (s.protocol !== Yf)
    return Ha("Plugin UI message protocol is missing or invalid.");
  if (s.version !== Gf)
    return {
      ok: !1,
      error: {
        code: ch.UNSUPPORTED_VERSION,
        message: `Unsupported Plugin UI protocol version: ${String(s.version)}.`
      }
    };
  if (typeof s.kind != "string" || !B0.has(s.kind))
    return Ha("Plugin UI message kind is missing or invalid.");
  if (typeof s.type != "string" || s.type.trim() === "")
    return Ha("Plugin UI message type must be a non-empty string.");
  const m = s.kind;
  if (m !== "event" && (typeof s.id != "string" || s.id.trim() === ""))
    return Ha(`Plugin UI ${m} messages must include a non-empty id.`);
  if (m === "error") {
    if (!$o(s.error))
      return Ha("Plugin UI error messages must include an error object.");
    if (typeof s.error.code != "string" || s.error.code.trim() === "")
      return Ha("Plugin UI error code must be a non-empty string.");
    if (typeof s.error.message != "string" || s.error.message.trim() === "")
      return Ha("Plugin UI error message must be a non-empty string.");
  }
  return {
    ok: !0,
    value: s
  };
}
class Po extends Error {
  name = "HanaPluginError";
  code;
  details;
  constructor(m) {
    super(m.message), this.code = m.code, this.details = m.details;
  }
}
let lh = 0;
function q0() {
  return typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : (lh += 1, `hana-plugin-${Date.now()}-${lh}`);
}
function Y0() {
  if (typeof window > "u")
    throw new Error("@hana/plugin-sdk requires a browser iframe window.");
  return window;
}
function G0(s) {
  if (!s)
    return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}
function Q0(s, m) {
  if (m)
    return m;
  const _ = new URLSearchParams(s.location.search).get("hana-host-origin");
  return _ || (G0(s.document.referrer) ?? "*");
}
function X0(s) {
  const m = new URLSearchParams(s.location.search);
  return {
    theme: m.get("hana-theme") ?? void 0,
    cssUrl: m.get("hana-css") ?? void 0
  };
}
function th(s, m, _) {
  return !(s.source !== m || _ !== "*" && s.origin !== _);
}
function L0(s) {
  return typeof s == "string" ? { url: s } : s;
}
function Z0(s) {
  return typeof s == "string" ? { text: s } : s;
}
function fh(s) {
  const m = /^\/api\/plugins\/([^/]+)(?:\/|$)/.exec(s.location.pathname || "");
  if (!m)
    throw new Error("Plugin asset URL helper requires an iframe route under /api/plugins/:pluginId/.");
  try {
    return decodeURIComponent(m[1]);
  } catch {
    throw new Error("Plugin asset URL helper could not decode the current plugin id.");
  }
}
function V0(s) {
  if (typeof s != "string" || s.length === 0)
    throw new Error("Invalid plugin asset path.");
  if (s.includes("\\") || s.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(s))
    throw new Error("Invalid plugin asset path.");
  const m = s.replace(/^\/+/, "");
  if (!m || m.startsWith("./"))
    throw new Error("Invalid plugin asset path.");
  const _ = m.split("/");
  if (_.some((r) => !r || r === "." || r === ".." || r.startsWith(".")))
    throw new Error("Invalid plugin asset path.");
  return _.map((r) => encodeURIComponent(r)).join("/");
}
function K0(s, m) {
  const _ = fh(s), r = V0(m);
  return `${s.location.origin}/api/plugins/${encodeURIComponent(_)}/assets/${r}`;
}
function J0(s) {
  return new URLSearchParams(s.location.search).get(H0) || null;
}
function w0(s) {
  if (typeof s != "string" || s.length === 0)
    throw new Error("Invalid plugin API path.");
  const m = s.trim();
  if (!m || m.includes("\\") || m.includes("\0") || m.includes("#") || m.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(m))
    throw new Error("Invalid plugin API path.");
  const _ = m.replace(/^\/+/, "");
  if (!_ || _.startsWith("./") || _ === "api/plugins" || _.startsWith("api/plugins/"))
    throw new Error("Invalid plugin API path. Use a route path relative to the current plugin.");
  const r = _.indexOf("?"), O = r >= 0 ? _.slice(0, r) : _;
  if (!O)
    throw new Error("Invalid plugin API path.");
  const C = O.split("/");
  for (const E of C) {
    if (!E)
      throw new Error("Invalid plugin API path.");
    let p;
    try {
      p = decodeURIComponent(E);
    } catch {
      throw new Error("Invalid plugin API path.");
    }
    if (p === "." || p === ".." || p.includes("/") || p.includes("\\"))
      throw new Error("Invalid plugin API path.");
  }
  const R = new URL(`http://hana.local/${_}`);
  return `${C.map((E) => encodeURIComponent(decodeURIComponent(E))).join("/")}${R.search}`;
}
function sh(s, m) {
  const _ = fh(s), r = w0(m);
  return `${s.location.origin}/api/plugins/${encodeURIComponent(_)}/${r}`;
}
function k0(s, m, _) {
  const r = J0(s);
  if (!r)
    throw new Error("hana.api.fetch requires pluginSurfaceSession in the iframe URL.");
  const O = s.fetch?.bind(s) ?? globalThis.fetch?.bind(globalThis);
  if (!O)
    throw new Error("hana.api.fetch requires window.fetch.");
  const C = _ ?? {}, R = new Headers(C.headers);
  return R.set(R0, r), O(sh(s, m), {
    ...C,
    headers: R
  });
}
function F0(s = {}) {
  const m = s.targetWindow ?? Y0(), _ = s.parentWindow ?? m.parent, r = Q0(m, s.targetOrigin), O = s.requestTimeoutMs ?? 1e4, C = s.idFactory ?? q0;
  let R = X0(m);
  const B = /* @__PURE__ */ new Set();
  function E(U) {
    _.postMessage(U, r);
  }
  function p(U, Y) {
    const cl = {
      protocol: Yf,
      version: Gf,
      kind: "event",
      type: U
    };
    Y !== void 0 && (cl.payload = Y), E(cl);
  }
  function X(U) {
    if (!th(U, _, r))
      return;
    const Y = Io(U.data);
    if (!Y.ok)
      return;
    const cl = Y.value;
    if (cl.kind !== "event" || cl.type !== "hana.theme.changed" || typeof cl.payload != "object" || cl.payload === null)
      return;
    const J = cl.payload;
    R = {
      theme: typeof J.theme == "string" ? J.theme : R.theme,
      cssUrl: typeof J.cssUrl == "string" ? J.cssUrl : R.cssUrl
    };
    for (const kl of B)
      kl(R);
  }
  function N(U, Y, cl = {}) {
    const J = C(), kl = cl.timeoutMs ?? O;
    return new Promise((Hl, tt) => {
      const xl = () => {
        m.removeEventListener("message", Ll), m.clearTimeout(at);
      }, Ll = (k) => {
        if (!th(k, _, r))
          return;
        const Ul = Io(k.data);
        if (!Ul.ok)
          return;
        const jl = Ul.value;
        jl.id !== J || jl.type !== U || (jl.kind === "response" && (xl(), Hl(jl.payload)), jl.kind === "error" && jl.error && (xl(), tt(new Po(jl.error))));
      }, at = m.setTimeout(() => {
        xl(), tt(new Po({
          code: "TIMEOUT",
          message: `Plugin host request timed out: ${U}.`
        }));
      }, kl);
      m.addEventListener("message", Ll);
      const Bl = {
        protocol: Yf,
        version: Gf,
        id: J,
        kind: "request",
        type: U
      };
      Y !== void 0 && (Bl.payload = Y), E(Bl);
    });
  }
  return {
    ready(U) {
      p("hana.ready", U);
    },
    assets: {
      url(U) {
        return K0(m, U);
      }
    },
    api: {
      url(U) {
        return sh(m, U);
      },
      fetch(U, Y) {
        return k0(m, U, Y);
      }
    },
    ui: {
      resize(U) {
        p(Ra.UI_RESIZE, U);
      },
      openPage(U) {
        return N(Ra.PLUGIN_PAGE_OPEN, {}, U);
      }
    },
    theme: {
      getSnapshot() {
        return { ...R };
      },
      subscribe(U) {
        return B.size === 0 && m.addEventListener("message", X), B.add(U), U({ ...R }), () => {
          B.delete(U), B.size === 0 && m.removeEventListener("message", X);
        };
      }
    },
    host: {
      request: N
    },
    toast: {
      show(U, Y) {
        return N(Ra.TOAST_SHOW, U, Y);
      }
    },
    external: {
      open(U, Y) {
        return N(Ra.EXTERNAL_OPEN, L0(U), Y);
      }
    },
    clipboard: {
      writeText(U, Y) {
        return N(Ra.CLIPBOARD_WRITE_TEXT, Z0(U), Y);
      }
    },
    resources: {
      open(U, Y) {
        return N(Ra.RESOURCE_OPEN, U, Y);
      },
      pick(U = {}, Y) {
        return N(Ra.RESOURCE_PICK, U, Y);
      },
      requestAccess(U, Y) {
        return N(Ra.RESOURCE_REQUEST_ACCESS, U, Y);
      }
    }
  };
}
let ah = null;
function lt() {
  return ah ??= F0(), ah;
}
const Qf = {
  ready(s) {
    return lt().ready(s);
  },
  assets: {
    url(s) {
      return lt().assets.url(s);
    }
  },
  api: {
    url(s) {
      return lt().api.url(s);
    },
    fetch(s, m) {
      return lt().api.fetch(s, m);
    }
  },
  ui: {
    resize(s) {
      return lt().ui.resize(s);
    },
    openPage(s) {
      return lt().ui.openPage(s);
    }
  },
  theme: {
    getSnapshot() {
      return lt().theme.getSnapshot();
    },
    subscribe(s) {
      return lt().theme.subscribe(s);
    }
  },
  host: {
    request(s, m, _) {
      return lt().host.request(s, m, _);
    }
  },
  toast: {
    show(s, m) {
      return lt().toast.show(s, m);
    }
  },
  external: {
    open(s, m) {
      return lt().external.open(s, m);
    }
  },
  clipboard: {
    writeText(s, m) {
      return lt().clipboard.writeText(s, m);
    }
  },
  resources: {
    open(s, m) {
      return lt().resources.open(s, m);
    },
    pick(s, m) {
      return lt().resources.pick(s, m);
    },
    requestAccess(s, m) {
      return lt().resources.requestAccess(s, m);
    }
  }
};
function Zt(...s) {
  return s.filter(Boolean).join(" ");
}
const eh = {
  "warm-paper": {
    bg: "#F8F5ED",
    bgCard: "#FCFAF5",
    accent: "#537D96",
    accentHover: "#456A80",
    accentLight: "rgba(83, 125, 150, 0.08)",
    text: "#3B3D3F",
    textLight: "#6B6F73",
    textMuted: "#8E9196",
    border: "rgba(83, 125, 150, 0.22)",
    danger: "#8B3A3A"
  },
  contemplation: {
    bg: "#F3F5F7",
    bgCard: "#F8F9FB",
    accent: "#7E99A8",
    accentHover: "#6B8594",
    accentLight: "rgba(126, 153, 168, 0.08)",
    text: "#2C3238",
    textLight: "#5A6570",
    textMuted: "#869098",
    border: "rgba(126, 153, 168, 0.22)",
    danger: "#8B4040"
  },
  "grass-aroma": {
    bg: "#F5F8F3",
    bgCard: "#F9FBF7",
    accent: "#5BA88C",
    accentHover: "#4D9179",
    accentLight: "rgba(91, 168, 140, 0.08)",
    text: "#2E3832",
    textLight: "#5E6B63",
    textMuted: "#8A9490",
    border: "rgba(91, 168, 140, 0.22)",
    danger: "#8B4A3A"
  },
  "high-contrast": {
    bg: "#FAF9F6",
    bgCard: "#FDFCFA",
    accent: "#3A6B85",
    accentHover: "#2E5870",
    accentLight: "rgba(58, 107, 133, 0.08)",
    text: "#1A1C1E",
    textLight: "#4A4E52",
    textMuted: "#6B6F73",
    border: "rgba(58, 107, 133, 0.28)",
    danger: "#7A3030"
  },
  midnight: {
    bg: "#3B4A54",
    bgCard: "#445560",
    accent: "#C99AAF",
    accentHover: "#D8AFC0",
    accentLight: "rgba(201, 154, 175, 0.11)",
    text: "#E1EAF0",
    textLight: "#B7C5CE",
    textMuted: "#A3B5C0",
    border: "rgba(170, 121, 141, 0.16)",
    danger: "#C77070"
  },
  "midnight-contrast": {
    bg: "#26343D",
    bgCard: "#30414B",
    accent: "#E6B1C4",
    accentHover: "#F0C4D3",
    accentLight: "rgba(230, 177, 196, 0.14)",
    text: "#F0F6FA",
    textLight: "#D3E0E8",
    textMuted: "#B7C8D3",
    border: "rgba(230, 177, 196, 0.26)",
    danger: "#E28B8B"
  },
  absolutely: {
    bg: "#F4F3EE",
    bgCard: "#FAF9F5",
    accent: "#B5846E",
    accentHover: "#A27460",
    accentLight: "rgba(181, 132, 110, 0.08)",
    text: "#2D2B28",
    textLight: "#6B6864",
    textMuted: "#9B9793",
    border: "rgba(177, 173, 161, 0.28)",
    danger: "#8B3A3A"
  },
  delve: {
    bg: "#FFFFFF",
    bgCard: "#F7F7F8",
    accent: "#1A1A1A",
    accentHover: "#000000",
    accentLight: "rgba(0, 0, 0, 0.05)",
    text: "#1A1A1A",
    textLight: "#6E6E6E",
    textMuted: "#999999",
    border: "rgba(0, 0, 0, 0.10)",
    danger: "#8B3A3A"
  },
  "deep-think": {
    bg: "#FCFCFD",
    bgCard: "#F8F8FA",
    accent: "#636AE8",
    accentHover: "#5158D4",
    accentLight: "rgba(99, 106, 232, 0.06)",
    text: "#1D1D1F",
    textLight: "#65656B",
    textMuted: "#95959C",
    border: "rgba(0, 0, 0, 0.09)",
    danger: "#8B3A3A"
  },
  "new-warm-paper": {
    bg: "#F5EFE4",
    bgCard: "#FBF7EE",
    accent: "#537D96",
    accentHover: "#3F6179",
    accentLight: "rgba(83, 125, 150, 0.08)",
    text: "#2A2622",
    textLight: "#4A433C",
    textMuted: "#6B6158",
    border: "#D8CFBE",
    danger: "#8B2C1F"
  }
}, W0 = {
  bg: "--hana-plugin-bg",
  bgCard: "--hana-plugin-bg-card",
  accent: "--hana-plugin-accent",
  accentHover: "--hana-plugin-accent-hover",
  accentLight: "--hana-plugin-accent-light",
  text: "--hana-plugin-text",
  textLight: "--hana-plugin-text-light",
  textMuted: "--hana-plugin-text-muted",
  border: "--hana-plugin-border",
  danger: "--hana-plugin-danger",
  radiusInput: "--hana-plugin-radius-input",
  radiusCard: "--hana-plugin-radius-card",
  fontUi: "--hana-plugin-font-ui",
  fontSerif: "--hana-plugin-font-serif",
  fontMono: "--hana-plugin-font-mono"
};
function uh({ mode: s = "inherit", theme: m, className: _, style: r, children: O, "data-testid": C = "hana-plugin-theme", ...R }) {
  const B = typeof m == "string" ? m : void 0, E = $0(s, m);
  return f.jsx("div", { ...R, "data-testid": C, className: Zt("hana-plugin-theme", _), "data-hana-theme-mode": s, "data-hana-theme": s === "hana" ? B : void 0, style: { ...E, ...r }, children: O });
}
function $0(s, m) {
  if (s === "inherit")
    return {};
  const _ = I0(s, m), r = {};
  for (const [O, C] of Object.entries(W0)) {
    const R = _?.[O];
    R && (r[C] = R);
  }
  return r;
}
function I0(s, m) {
  if (typeof m == "string")
    return eh[m];
  if (m)
    return m;
  if (s === "hana")
    return eh["warm-paper"];
}
const Xl = I.forwardRef(function({ variant: m = "secondary", size: _ = "md", loading: r = !1, iconLeft: O, iconRight: C, disabled: R, className: B, children: E, type: p = "button", ...X }, N) {
  return f.jsxs("button", { ...X, ref: N, type: p, disabled: R || r, className: Zt("hana-plugin-button", `hana-plugin-button-${m}`, `hana-plugin-button-${_}`, r && "hana-plugin-button-loading", B), children: [r ? f.jsx("span", { className: "hana-plugin-spinner", "aria-hidden": !0 }) : O, E && f.jsx("span", { className: "hana-plugin-button-label", children: E }), !r && C] });
});
I.forwardRef(function({ label: m, size: _ = "md", variant: r = "ghost", className: O, children: C, type: R = "button", ...B }, E) {
  return f.jsx("button", { ...B, ref: E, type: R, "aria-label": m, title: B.title || m, className: Zt("hana-plugin-icon-button", `hana-plugin-icon-button-${_}`, `hana-plugin-icon-button-${r}`, O), children: C });
});
const P0 = I.forwardRef(function({ label: m, hint: _, error: r, id: O, className: C, inputClassName: R, ...B }, E) {
  const p = I.useId(), X = O || p;
  return f.jsx(Zf, { label: m, hint: _, error: r, htmlFor: X, className: C, children: f.jsx("input", { ...B, ref: E, id: X, "aria-invalid": !!r, className: Zt("hana-plugin-input", R) }) });
});
I.forwardRef(function({ label: m, hint: _, error: r, id: O, className: C, textareaClassName: R, rows: B = 4, ...E }, p) {
  const X = I.useId(), N = O || X;
  return f.jsx(Zf, { label: m, hint: _, error: r, htmlFor: N, className: C, children: f.jsx("textarea", { ...E, ref: p, id: N, rows: B, "aria-invalid": !!r, className: Zt("hana-plugin-textarea", R) }) });
});
const nh = I.forwardRef(function({ checked: m, onChange: _, label: r, disabled: O, className: C, onClick: R, type: B = "button", ...E }, p) {
  const X = typeof r == "string" ? r : E["aria-label"];
  return f.jsxs("span", { className: Zt("hana-plugin-switch-wrap", C), children: [f.jsx("button", { ...E, ref: p, type: B, role: "switch", "aria-checked": m, "aria-label": X, disabled: O, className: Zt("hana-plugin-switch", m && "hana-plugin-switch-on"), onClick: (N) => {
    R?.(N), !N.defaultPrevented && !O && _?.(!m);
  }, children: f.jsx("span", { className: "hana-plugin-switch-thumb", "aria-hidden": !0 }) }), r && f.jsx("span", { className: "hana-plugin-switch-label", children: r })] });
});
function lv({ options: s, value: m, onChange: _, label: r, hint: O, error: C, placeholder: R = "Select", disabled: B = !1, className: E }) {
  const [p, X] = I.useState(!1), N = s.find((J) => J.value === m), U = N?.label || R, Y = typeof r == "string" ? r : void 0, cl = [Y, U].filter(Boolean).join(" ");
  return f.jsx(Zf, { label: r, hint: O, error: C, className: E, children: f.jsxs("div", { className: "hana-plugin-select", children: [f.jsxs("button", { type: "button", "aria-haspopup": "listbox", "aria-expanded": p, "aria-label": cl || void 0, disabled: B, className: Zt("hana-plugin-select-trigger", !N && "hana-plugin-select-placeholder"), onClick: () => X((J) => !J), children: [f.jsx("span", { className: "hana-plugin-select-value", children: U }), f.jsx("span", { className: "hana-plugin-select-arrow", "aria-hidden": !0, children: "▾" })] }), p && f.jsx("div", { className: "hana-plugin-select-popover", role: "listbox", "aria-label": Y, children: s.map((J) => f.jsx("button", { type: "button", role: "option", "aria-selected": J.value === m, disabled: J.disabled, className: Zt("hana-plugin-select-option", J.value === m && "hana-plugin-select-option-selected"), onClick: () => {
    J.disabled || (_(J.value), X(!1));
  }, children: J.label }, J.value)) })] }) });
}
function Zf({ label: s, hint: m, error: _, htmlFor: r, className: O, children: C }) {
  return f.jsxs("div", { className: Zt("hana-plugin-field", O), children: [s && f.jsx("label", { className: "hana-plugin-field-label", htmlFor: r, children: s }), m && f.jsx("div", { className: "hana-plugin-field-hint", children: m }), C, _ && f.jsx("div", { className: "hana-plugin-field-error", children: _ })] });
}
const tv = [
  { id: "overview", label: "总览" },
  { id: "market", label: "市场" },
  { id: "research", label: "研究" },
  { id: "portfolio", label: "组合" },
  { id: "quant", label: "量化" },
  { id: "automation", label: "自动化" },
  { id: "agent", label: "Agent" },
  { id: "exchange", label: "交换" },
  { id: "diagnostics", label: "诊断" }
], rh = { calendar: "versioned", marketRules: "A-HK-research-v1", tPlusOne: !0, priceLimits: "market-specific-v1", pit: !0, adjustment: "none", fees: 1e-3, slippage: 1e-3, liquidity: "daily-volume-5pct", capacity: 1e6 };
async function El(s, m) {
  const _ = await Qf.api.fetch(s, m), r = await _.json();
  if (!_.ok || r.ok === !1) throw new Error(r.error?.message || `请求失败 (${_.status})`);
  return r;
}
function av() {
  const s = (document.getElementById("root")?.dataset.surface || "page") === "widget", [m, _] = I.useState("overview"), [r, O] = I.useState(!0), [C, R] = I.useState(""), [B, E] = I.useState(""), [p, X] = I.useState({}), [N, U] = I.useState({ cells: [], sourcePolicies: [] }), [Y, cl] = I.useState([]), [J, kl] = I.useState("600519.SH"), [Hl, tt] = I.useState({}), [xl, Ll] = I.useState({ records: [] }), [at, Bl] = I.useState({ watchlists: [], researchPools: [] }), [k, Ul] = I.useState({ positions: [], totalsByCurrency: [] }), [jl, fa] = I.useState([]), [rt, Fl] = I.useState([]), [Dt, bt] = I.useState([]), [dt, x] = I.useState([]), [D, V] = I.useState({ events: [], counts: {} }), [sl, rl] = I.useState(null), [h, j] = I.useState(""), [M, q] = I.useState("ALL"), [K, $] = I.useState('[{"assetId":"600519.SH","side":"buy","quantity":10,"price":1380,"fee":8,"date":"2026-08-01"}]'), [tl, Yl] = I.useState(null), [Al, qa] = I.useState(null), [Ya, we] = I.useState(!1), [ke, Yt] = I.useState(!1), sa = I.useCallback(async () => {
    O(!0), E("");
    try {
      if (s) {
        const pt = await El("api/widget-summary");
        X(pt), tt(pt.quote), Ul({ positions: Array.from({ length: pt.positionCount }), totalsByCurrency: [] }), bt(Array.from({ length: pt.monitorCount }));
        return;
      }
      const [L, gl, _l, yi, gi, Si, ce, Xa, fe] = await Promise.all([
        El("api/status"),
        El("api/capabilities"),
        El("api/assets"),
        El("api/lists"),
        El("api/portfolio"),
        El("api/strategies"),
        El("api/backtests"),
        El("api/monitors"),
        El("api/diagnostics")
      ]);
      X(L), U(gl), cl(_l.assets), Bl(yi), Ul(gi), fa(Si.strategies), Fl(ce.backtests), bt(Xa.monitors), x(Xa.tasks || []), V(fe);
    } catch (L) {
      E(L instanceof Error ? L.message : String(L));
    } finally {
      O(!1);
    }
  }, [s]), ne = I.useCallback(async (L) => {
    R("asset"), E("");
    try {
      const [gl, _l] = await Promise.all([El(`api/quote/${encodeURIComponent(L)}`), El(`api/research/${encodeURIComponent(L)}`)]);
      tt(gl), Ll(_l);
    } catch (gl) {
      E(gl instanceof Error ? gl.message : String(gl));
    } finally {
      R("");
    }
  }, []);
  I.useEffect(() => {
    Qf.ready(), Qf.ui.resize({ height: s ? 520 : 760 }), sa();
  }, [s, sa]), I.useEffect(() => {
    s || ne(J);
  }, [s, J, ne]);
  const si = I.useMemo(() => Y.filter((L) => (M === "ALL" || L.market === M) && (!h || `${L.assetId}${L.name}`.toLowerCase().includes(h.toLowerCase()))), [Y, M, h]), Ga = Y.find((L) => L.assetId === J), Fe = Hl.snapshot?.rows || [], We = I.useMemo(() => Object.fromEntries(["supported", "partial", "experimental", "unavailable", "blocked"].map((L) => [L, N.cells.filter((gl) => gl.status === L).length])), [N]);
  async function Wl(L, gl) {
    R(L), E("");
    try {
      await gl(), await sa();
    } catch (_l) {
      E(_l instanceof Error ? _l.message : String(_l));
    } finally {
      R("");
    }
  }
  const ri = () => Wl("watchlist", async () => {
    await El("api/lists", Mt({ kind: "watchlist", action: "add", assetId: J }));
  }), di = () => Wl("ledger-preview", async () => {
    const L = await El("api/portfolio/preview", Mt({ format: "json", content: K }));
    Yl(L.preview);
  }), Il = () => tl ? Wl("ledger-commit", async () => {
    await El("api/portfolio/commit", Mt({ previewId: tl.previewId, revision: tl.baseRevision, digest: tl.digest })), Yl(null);
  }) : Promise.resolve(), oi = () => Wl("strategy", async () => {
    await El("api/strategies", Mt({ name: "A/HK 质量研究", universe: ["600519.SH", "00700.HK"], filters: [], factors: [{ field: "price_momentum", weight: 1 }], rebalance: "monthly", missing: "exclude" }));
  }), Ku = () => {
    const L = jl.at(-1);
    return L ? ke ? Wl("backtest", async () => {
      await El("api/backtests", Mt({ immutableId: L.immutableId, allowExperimental: Ya, confirmed: !0, runBudget: 1e4, assumptions: rh })), Yt(!1);
    }) : (E("请先审核并确认全部回测假设"), Promise.resolve()) : (E("请先保存策略"), Promise.resolve());
  }, Ju = () => Wl("monitor", async () => {
    await El("api/monitors", Mt({ assetId: J, condition: "above", threshold: Number(Fe[0]?.price || 1) * 1.02, intervalSeconds: 60, cooldownSeconds: 300, confirmed: !0 }));
  }), ie = (L, gl) => Wl(`monitor-${gl}`, async () => {
    await El("api/monitors/action", Mt({ monitorId: L, action: gl, confirmed: !0 }));
  }), hi = () => Wl("research-task", async () => {
    await El("api/research-tasks", Mt({ assetId: J, intervalSeconds: 86400, confirmed: !0 }));
  }), wu = (L, gl) => Wl(`research-task-${gl}`, async () => {
    await El("api/research-tasks/action", Mt({ taskId: L, action: gl, confirmed: !0 }));
  }), mi = (L) => Wl("source-policy", async () => {
    await El("api/source-policy", Mt({ market: Ga?.market || "A", dataset: "quote", workflow: "interactive", mode: L, ...L === "pinned" ? { pinnedSource: "hana-fixture" } : {} }));
  }), vi = () => Wl("agent", async () => {
    const L = await El("api/agent/run", Mt({ assetId: J, question: "汇总当前公开证据和限制", useModel: !1 }));
    rl(L.run);
  }), Qa = () => Wl("export", async () => {
    const L = await El("api/exchange/preview", Mt({ format: "json", sections: ["portfolio", "strategies", "backtests", "monitors"] }));
    qa(L.preview);
  });
  return s ? /* @__PURE__ */ f.jsx(uh, { mode: "inherit", className: "finance-app compact", children: /* @__PURE__ */ f.jsx(ov, { status: p, quote: Hl, portfolio: k, monitors: Dt, loading: r }) }) : /* @__PURE__ */ f.jsxs(uh, { mode: "inherit", className: "finance-app", children: [
    /* @__PURE__ */ f.jsxs("header", { className: "topbar", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h1", { children: "Finance Workbench" }),
        /* @__PURE__ */ f.jsxs("span", { className: "version", children: [
          "v",
          p.plugin?.version || "1.0.0"
        ] })
      ] }),
      /* @__PURE__ */ f.jsxs("div", { className: "top-actions", children: [
        /* @__PURE__ */ f.jsx("span", { className: "no-trade", children: "只读研究" }),
        /* @__PURE__ */ f.jsx(Xl, { variant: "ghost", onClick: () => {
          sa();
        }, disabled: r, children: "刷新" })
      ] })
    ] }),
    /* @__PURE__ */ f.jsx("nav", { className: "nav", "aria-label": "工作台导航", children: tv.map((L) => /* @__PURE__ */ f.jsx("button", { className: m === L.id ? "active" : "", onClick: () => _(L.id), children: L.label }, L.id)) }),
    B && /* @__PURE__ */ f.jsxs("div", { className: "error", role: "alert", children: [
      /* @__PURE__ */ f.jsx("span", { children: B }),
      /* @__PURE__ */ f.jsx("button", { onClick: () => E(""), "aria-label": "关闭错误", children: "x" })
    ] }),
    /* @__PURE__ */ f.jsxs("main", { className: "workspace", "aria-busy": r || !!C, children: [
      m === "overview" && /* @__PURE__ */ f.jsx(ev, { status: p, counts: We, portfolio: k, monitors: Dt, backtests: rt, onNavigate: _ }),
      m === "market" && /* @__PURE__ */ f.jsx(uv, { capabilities: N, assets: si, query: h, setQuery: j, market: M, setMarket: q, selectedAsset: J, setSelectedAsset: kl, quote: Hl, onWatchlist: ri, onPolicy: mi, busy: C }),
      m === "research" && /* @__PURE__ */ f.jsx(nv, { selected: Ga, dossier: xl, lists: at, onSelect: kl }),
      m === "portfolio" && /* @__PURE__ */ f.jsx(iv, { portfolio: k, ledgerText: K, setLedgerText: $, preview: tl, onPreview: di, onCommit: Il, busy: C }),
      m === "quant" && /* @__PURE__ */ f.jsx(cv, { strategies: jl, backtests: rt, experimental: Ya, setExperimental: we, confirmed: ke, setConfirmed: Yt, onSave: oi, onRun: Ku, busy: C }),
      m === "automation" && /* @__PURE__ */ f.jsx(fv, { monitors: Dt, tasks: dt, selected: Ga, onCreate: Ju, onAction: ie, onCreateTask: hi, onTaskAction: wu, busy: C }),
      m === "agent" && /* @__PURE__ */ f.jsx(sv, { selected: Ga, result: sl, onRun: vi, busy: C }),
      m === "exchange" && /* @__PURE__ */ f.jsx(rv, { preview: Al, onPreview: Qa, busy: C }),
      m === "diagnostics" && /* @__PURE__ */ f.jsx(dv, { diagnostics: D, capabilities: N })
    ] })
  ] });
}
function ev({ status: s, counts: m, portfolio: _, monitors: r, backtests: O, onNavigate: C }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "metrics", children: [
      /* @__PURE__ */ f.jsx(qt, { label: "可用模块", value: String(s.modules?.length || 0), detail: "A / HK" }),
      /* @__PURE__ */ f.jsx(qt, { label: "实验数据源", value: String(m.experimental || 0), detail: `${m.blocked || 0} blocked` }),
      /* @__PURE__ */ f.jsx(qt, { label: "组合币种", value: String(_.totalsByCurrency?.length || 0), detail: `${_.positions?.length || 0} positions` }),
      /* @__PURE__ */ f.jsx(qt, { label: "任务", value: String(r.length), detail: `${O.length} backtests` })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h2", { children: "能力状态" }),
        /* @__PURE__ */ f.jsx("p", { children: "数据集按来源、时间、单位与质量独立判定" })
      ] }),
      /* @__PURE__ */ f.jsx(hv, { counts: m })
    ] }),
    /* @__PURE__ */ f.jsx("section", { className: "module-grid", children: [["market", "市场与来源"], ["research", "资产研究"], ["portfolio", "组合账本"], ["quant", "量化回测"], ["automation", "监控任务"], ["agent", "Agent 研究"], ["exchange", "导入导出"], ["diagnostics", "诊断审计"]].map(([R, B]) => /* @__PURE__ */ f.jsxs("button", { onClick: () => C(R), children: [
      /* @__PURE__ */ f.jsx("span", { children: B }),
      /* @__PURE__ */ f.jsx("b", { children: "打开" })
    ] }, R)) }),
    /* @__PURE__ */ f.jsxs("section", { className: "notice", children: [
      /* @__PURE__ */ f.jsx("strong", { children: "本地历史源" }),
      /* @__PURE__ */ f.jsx("span", { children: s.marketDump?.status || "blocked" }),
      /* @__PURE__ */ f.jsx("p", { children: s.marketDump?.reason })
    ] })
  ] });
}
function uv({ capabilities: s, assets: m, query: _, setQuery: r, market: O, setMarket: C, selectedAsset: R, setSelectedAsset: B, quote: E, onWatchlist: p, onPolicy: X, busy: N }) {
  const U = E.snapshot?.rows?.[0];
  return /* @__PURE__ */ f.jsxs("div", { className: "split", children: [
    /* @__PURE__ */ f.jsxs("aside", { className: "asset-pane", children: [
      /* @__PURE__ */ f.jsxs("div", { className: "filter-row", children: [
        /* @__PURE__ */ f.jsx(P0, { "aria-label": "搜索资产", placeholder: "代码或名称", value: _, onChange: (Y) => r(Y.currentTarget.value) }),
        /* @__PURE__ */ f.jsx(lv, { value: O, onChange: C, options: [{ value: "ALL", label: "全部" }, { value: "A", label: "A 股" }, { value: "HK", label: "港股" }] })
      ] }),
      /* @__PURE__ */ f.jsx("div", { className: "asset-list", children: m.map((Y) => /* @__PURE__ */ f.jsxs("button", { className: R === Y.assetId ? "selected" : "", onClick: () => B(Y.assetId), children: [
        /* @__PURE__ */ f.jsxs("span", { children: [
          /* @__PURE__ */ f.jsx("b", { children: Y.name }),
          /* @__PURE__ */ f.jsx("small", { children: Y.assetId })
        ] }),
        /* @__PURE__ */ f.jsx("em", { children: Y.currency })
      ] }, Y.assetId)) })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "detail-pane", children: [
      /* @__PURE__ */ f.jsxs("div", { className: "section-head", children: [
        /* @__PURE__ */ f.jsxs("div", { children: [
          /* @__PURE__ */ f.jsxs("span", { className: "eyebrow", children: [
            E.asset?.market,
            " / ",
            E.asset?.currency
          ] }),
          /* @__PURE__ */ f.jsx("h2", { children: E.asset?.name || "资产行情" })
        ] }),
        /* @__PURE__ */ f.jsxs("div", { className: "chip-row", children: [
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => X("auto"), disabled: N === "source-policy", children: "Auto" }),
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => X("pinned"), disabled: N === "source-policy", children: "Pin fixture" }),
          /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: p, disabled: N === "watchlist", children: "加入自选" })
        ] })
      ] }),
      U && /* @__PURE__ */ f.jsxs(f.Fragment, { children: [
        /* @__PURE__ */ f.jsxs("div", { className: "quote-line", children: [
          /* @__PURE__ */ f.jsx("strong", { children: Bt(U.price) }),
          /* @__PURE__ */ f.jsx("span", { className: U.price >= U.previousClose ? "up" : "down", children: fi(U.price / U.previousClose - 1) }),
          /* @__PURE__ */ f.jsx(Ba, { state: E.snapshot.stale ? "stale" : E.snapshot.quality?.status })
        ] }),
        /* @__PURE__ */ f.jsxs("div", { className: "ohlc", children: [
          /* @__PURE__ */ f.jsxs("span", { children: [
            "开 ",
            Bt(U.open)
          ] }),
          /* @__PURE__ */ f.jsxs("span", { children: [
            "高 ",
            Bt(U.high)
          ] }),
          /* @__PURE__ */ f.jsxs("span", { children: [
            "低 ",
            Bt(U.low)
          ] }),
          /* @__PURE__ */ f.jsxs("span", { children: [
            "量 ",
            vv(U.volume)
          ] })
        ] }),
        /* @__PURE__ */ f.jsx(mv, { rows: E.snapshot.rows })
      ] }),
      /* @__PURE__ */ f.jsx("h3", { children: "来源矩阵（A / HK）" }),
      /* @__PURE__ */ f.jsx("div", { className: "table-wrap", children: /* @__PURE__ */ f.jsxs("table", { children: [
        /* @__PURE__ */ f.jsx("thead", { children: /* @__PURE__ */ f.jsxs("tr", { children: [
          /* @__PURE__ */ f.jsx("th", { children: "市场" }),
          /* @__PURE__ */ f.jsx("th", { children: "数据集" }),
          /* @__PURE__ */ f.jsx("th", { children: "Provider" }),
          /* @__PURE__ */ f.jsx("th", { children: "状态" }),
          /* @__PURE__ */ f.jsx("th", { children: "原因" })
        ] }) }),
        /* @__PURE__ */ f.jsx("tbody", { children: s.cells.map((Y, cl) => /* @__PURE__ */ f.jsxs("tr", { children: [
          /* @__PURE__ */ f.jsx("td", { children: Y.market }),
          /* @__PURE__ */ f.jsx("td", { children: Y.dataset }),
          /* @__PURE__ */ f.jsx("td", { children: Y.provider }),
          /* @__PURE__ */ f.jsx("td", { children: /* @__PURE__ */ f.jsx(Ba, { state: Y.status }) }),
          /* @__PURE__ */ f.jsx("td", { children: Y.reason })
        ] }, `${Y.market}-${Y.dataset}-${Y.provider}-${cl}`)) })
      ] }) })
    ] })
  ] });
}
function nv({ selected: s, dossier: m, lists: _, onSelect: r }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("span", { className: "eyebrow", children: s?.assetId }),
        /* @__PURE__ */ f.jsx("h2", { children: s?.name || "研究底稿" })
      ] }),
      /* @__PURE__ */ f.jsx("div", { className: "chip-row", children: _.watchlists?.[0]?.assets?.map((O) => /* @__PURE__ */ f.jsx("button", { onClick: () => r(O.assetId), children: O.name }, O.assetId)) })
    ] }),
    /* @__PURE__ */ f.jsx("section", { className: "records", children: m.records?.length ? m.records.map((O) => /* @__PURE__ */ f.jsxs("article", { children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx(Ba, { state: O.quality }),
        /* @__PURE__ */ f.jsxs("small", { children: [
          O.dataset,
          " / ",
          O.period
        ] })
      ] }),
      /* @__PURE__ */ f.jsx("h3", { children: O.title }),
      /* @__PURE__ */ f.jsxs("dl", { children: [
        /* @__PURE__ */ f.jsx("dt", { children: "取得时间" }),
        /* @__PURE__ */ f.jsx("dd", { children: Xf(O.evidence.acquiredAt) }),
        /* @__PURE__ */ f.jsx("dt", { children: "适用时间" }),
        /* @__PURE__ */ f.jsx("dd", { children: Xf(O.evidence.applicableAt) }),
        /* @__PURE__ */ f.jsx("dt", { children: "Hash" }),
        /* @__PURE__ */ f.jsx("dd", { className: "mono", children: O.evidence.contentHash.slice(0, 16) })
      ] }),
      O.limitations.map((C) => /* @__PURE__ */ f.jsx("p", { className: "limitation", children: C }, C))
    ] }, O.evidence.evidenceId)) : /* @__PURE__ */ f.jsx(Vu, { text: "当前资产没有证据记录" }) })
  ] });
}
function iv({ portfolio: s, ledgerText: m, setLedgerText: _, preview: r, onPreview: O, onCommit: C, busy: R }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsx("section", { className: "metrics", children: s.totalsByCurrency.map((B) => /* @__PURE__ */ f.jsx(qt, { label: `${B.currency} 市值`, value: Bt(B.marketValue), detail: `P&L ${Bt(B.unrealizedPnl)}` }, B.currency)) }),
    /* @__PURE__ */ f.jsxs("section", { className: "band vertical", children: [
      /* @__PURE__ */ f.jsx("div", { children: /* @__PURE__ */ f.jsx("h2", { children: "持仓" }) }),
      /* @__PURE__ */ f.jsx("div", { className: "table-wrap", children: /* @__PURE__ */ f.jsxs("table", { children: [
        /* @__PURE__ */ f.jsx("thead", { children: /* @__PURE__ */ f.jsxs("tr", { children: [
          /* @__PURE__ */ f.jsx("th", { children: "资产" }),
          /* @__PURE__ */ f.jsx("th", { children: "股数" }),
          /* @__PURE__ */ f.jsx("th", { children: "成本" }),
          /* @__PURE__ */ f.jsx("th", { children: "市值" }),
          /* @__PURE__ */ f.jsx("th", { children: "P&L" }),
          /* @__PURE__ */ f.jsx("th", { children: "状态" })
        ] }) }),
        /* @__PURE__ */ f.jsx("tbody", { children: s.positions.map((B) => /* @__PURE__ */ f.jsxs("tr", { children: [
          /* @__PURE__ */ f.jsx("td", { children: B.assetId }),
          /* @__PURE__ */ f.jsx("td", { children: B.quantity }),
          /* @__PURE__ */ f.jsx("td", { children: Bt(B.cost) }),
          /* @__PURE__ */ f.jsx("td", { children: Bt(B.marketValue) }),
          /* @__PURE__ */ f.jsx("td", { children: Bt(B.unrealizedPnl) }),
          /* @__PURE__ */ f.jsx("td", { children: /* @__PURE__ */ f.jsx(Ba, { state: B.status }) })
        ] }, B.assetId)) })
      ] }) })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "editor", children: [
      /* @__PURE__ */ f.jsx("h2", { children: "账本导入" }),
      /* @__PURE__ */ f.jsx("textarea", { value: m, onChange: (B) => _(B.currentTarget.value), "aria-label": "账本 JSON" }),
      /* @__PURE__ */ f.jsxs("div", { className: "editor-actions", children: [
        /* @__PURE__ */ f.jsx(Xl, { onClick: O, disabled: R === "ledger-preview", children: "预览" }),
        /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: C, disabled: !r || R === "ledger-commit", children: "确认写入" })
      ] }),
      r && /* @__PURE__ */ f.jsxs("p", { children: [
        r.rows?.length || 0,
        " 行可写入，",
        r.errors?.length || 0,
        " 个错误"
      ] })
    ] })
  ] });
}
function cv({ strategies: s, backtests: m, experimental: _, setExperimental: r, confirmed: O, setConfirmed: C, onSave: R, onRun: B, busy: E }) {
  const p = m.at(-1);
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h2", { children: "策略定义" }),
        /* @__PURE__ */ f.jsxs("p", { children: [
          s.length,
          " 个不可变版本"
        ] })
      ] }),
      /* @__PURE__ */ f.jsx(Xl, { onClick: R, disabled: E === "strategy", children: "保存示例策略" })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "quant-grid", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h3", { children: "最近策略" }),
        s.at(-1) ? /* @__PURE__ */ f.jsx("pre", { children: JSON.stringify(s.at(-1), null, 2) }) : /* @__PURE__ */ f.jsx(Vu, { text: "尚无策略" })
      ] }),
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h3", { children: "回测门禁" }),
        /* @__PURE__ */ f.jsx("dl", { className: "assumptions", children: Object.entries(rh).map(([X, N]) => /* @__PURE__ */ f.jsxs("div", { children: [
          /* @__PURE__ */ f.jsx("dt", { children: X }),
          /* @__PURE__ */ f.jsx("dd", { children: String(N) })
        ] }, X)) }),
        /* @__PURE__ */ f.jsxs("label", { className: "toggle", children: [
          /* @__PURE__ */ f.jsx(nh, { checked: _, onChange: r, label: "允许明确标注的实验 fixture" }),
          /* @__PURE__ */ f.jsx("span", { children: "允许实验 fixture" })
        ] }),
        /* @__PURE__ */ f.jsxs("label", { className: "toggle", children: [
          /* @__PURE__ */ f.jsx(nh, { checked: O, onChange: C, label: "已审核回测规则、数据覆盖和成本假设" }),
          /* @__PURE__ */ f.jsx("span", { children: "已审核以上假设与数据覆盖" })
        ] }),
        /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: B, disabled: !s.length || !O || E === "backtest", children: "运行回测" }),
        p && /* @__PURE__ */ f.jsxs("div", { className: "result", children: [
          /* @__PURE__ */ f.jsx("b", { children: fi(p.metrics.netReturn) }),
          /* @__PURE__ */ f.jsx("span", { children: "净收益" }),
          /* @__PURE__ */ f.jsxs("small", { children: [
            "最大回撤 ",
            fi(p.metrics.maxDrawdown)
          ] }),
          /* @__PURE__ */ f.jsx(Ba, { state: p.quality })
        ] })
      ] })
    ] })
  ] });
}
function fv({ monitors: s, tasks: m, selected: _, onCreate: r, onAction: O, onCreateTask: C, onTaskAction: R, busy: B }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h2", { children: "监控与定时研究" }),
        /* @__PURE__ */ f.jsx("p", { children: _?.name || _?.assetId })
      ] }),
      /* @__PURE__ */ f.jsxs("div", { className: "chip-row", children: [
        /* @__PURE__ */ f.jsx(Xl, { onClick: C, disabled: B === "research-task", children: "确认创建每日研究" }),
        /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: r, disabled: B === "monitor", children: "确认创建 +2% 监控" })
      ] })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "task-list", children: [
      s.map((E) => /* @__PURE__ */ f.jsxs("article", { children: [
        /* @__PURE__ */ f.jsxs("div", { children: [
          /* @__PURE__ */ f.jsxs("b", { children: [
            "行情监控 / ",
            E.assetId
          ] }),
          /* @__PURE__ */ f.jsx(Ba, { state: E.status })
        ] }),
        /* @__PURE__ */ f.jsxs("p", { children: [
          E.condition,
          " ",
          Bt(E.threshold),
          " / ",
          E.intervalSeconds,
          "s / cooldown ",
          E.cooldownSeconds,
          "s"
        ] }),
        /* @__PURE__ */ f.jsx("small", { children: E.lastObservation?.reason || "等待 TaskRegistry 调度" }),
        /* @__PURE__ */ f.jsxs("div", { className: "chip-row", children: [
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => O(E.id, E.status === "paused" ? "resume" : "pause"), children: E.status === "paused" ? "恢复" : "暂停" }),
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => O(E.id, "retry"), children: "重试" }),
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => O(E.id, "cancel"), children: "请求取消" })
        ] })
      ] }, E.id)),
      m.map((E) => /* @__PURE__ */ f.jsxs("article", { children: [
        /* @__PURE__ */ f.jsxs("div", { children: [
          /* @__PURE__ */ f.jsxs("b", { children: [
            "定时研究 / ",
            E.assetId
          ] }),
          /* @__PURE__ */ f.jsx(Ba, { state: E.status })
        ] }),
        /* @__PURE__ */ f.jsxs("p", { children: [
          "Run ",
          E.runId,
          " / ",
          E.intervalSeconds,
          "s / checkpoint ",
          E.checkpoint?.sequence || 0
        ] }),
        /* @__PURE__ */ f.jsxs("small", { children: [
          "来源清单 ",
          E.sourceManifest?.hash?.slice(0, 16),
          " / ",
          E.recoveryReason || "等待 TaskRegistry 调度"
        ] }),
        /* @__PURE__ */ f.jsxs("div", { className: "chip-row", children: [
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => R(E.id, E.status === "paused" ? "resume" : "pause"), children: E.status === "paused" ? "恢复" : "暂停" }),
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => R(E.id, "retry"), children: "重试" }),
          /* @__PURE__ */ f.jsx(Xl, { onClick: () => R(E.id, "cancel"), children: "请求取消" })
        ] })
      ] }, E.id)),
      !s.length && !m.length && /* @__PURE__ */ f.jsx(Vu, { text: "尚无监控或定时研究任务" })
    ] })
  ] });
}
function sv({ selected: s, result: m, onRun: _, busy: r }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h2", { children: "Agent 研究" }),
        /* @__PURE__ */ f.jsxs("p", { children: [
          s?.name,
          " / 公开证据 / 确定性模式"
        ] })
      ] }),
      /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: _, disabled: r === "agent", children: "运行公开研究" })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "consent-grid", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h3", { children: "当前边界" }),
        /* @__PURE__ */ f.jsxs("ul", { children: [
          /* @__PURE__ */ f.jsx("li", { children: "AI 默认关闭" }),
          /* @__PURE__ */ f.jsx("li", { children: "私有字段逐 run 授权" }),
          /* @__PURE__ */ f.jsx("li", { children: "模型外发逐字段预览" }),
          /* @__PURE__ */ f.jsx("li", { children: "交易意图永久拒绝" })
        ] })
      ] }),
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h3", { children: "研究结果" }),
        m ? /* @__PURE__ */ f.jsxs(f.Fragment, { children: [
          /* @__PURE__ */ f.jsx("p", { children: m.output }),
          /* @__PURE__ */ f.jsx("div", { className: "chip-row", children: m.evidenceIds.map((O) => /* @__PURE__ */ f.jsx("span", { children: O.slice(0, 18) }, O)) }),
          /* @__PURE__ */ f.jsx("small", { children: m.disclaimer })
        ] }) : /* @__PURE__ */ f.jsx(Vu, { text: "尚无 Agent 运行" })
      ] })
    ] })
  ] });
}
function rv({ preview: s, onPreview: m, busy: _ }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "band", children: [
      /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("h2", { children: "导入导出" }),
        /* @__PURE__ */ f.jsx("p", { children: "SessionFile / ResourceIO / 版本化 schema" })
      ] }),
      /* @__PURE__ */ f.jsx(Xl, { variant: "primary", onClick: m, disabled: _ === "export", children: "预览 JSON 导出" })
    ] }),
    s ? /* @__PURE__ */ f.jsxs("section", { className: "manifest", children: [
      /* @__PURE__ */ f.jsxs("dl", { children: [
        /* @__PURE__ */ f.jsx("dt", { children: "Preview ID" }),
        /* @__PURE__ */ f.jsx("dd", { className: "mono", children: s.previewId }),
        /* @__PURE__ */ f.jsx("dt", { children: "格式" }),
        /* @__PURE__ */ f.jsx("dd", { children: s.format }),
        /* @__PURE__ */ f.jsx("dt", { children: "字段数" }),
        /* @__PURE__ */ f.jsx("dd", { children: s.fieldCount }),
        /* @__PURE__ */ f.jsx("dt", { children: "隐私" }),
        /* @__PURE__ */ f.jsx("dd", { children: s.privacy }),
        /* @__PURE__ */ f.jsx("dt", { children: "Digest" }),
        /* @__PURE__ */ f.jsx("dd", { className: "mono", children: s.digest })
      ] }),
      /* @__PURE__ */ f.jsx("p", { children: "文件交付由 Agent 导出工具通过 SessionFile 完成。" })
    ] }) : /* @__PURE__ */ f.jsx(Vu, { text: "选择导出后先预览字段、目标与隐私范围" })
  ] });
}
function dv({ diagnostics: s, capabilities: m }) {
  const _ = m.cells.find((r) => r.market === "A" && r.dataset === "quote" && r.provider === "hithink-rest");
  return /* @__PURE__ */ f.jsxs("div", { className: "stack", children: [
    /* @__PURE__ */ f.jsxs("section", { className: "metrics", children: [
      /* @__PURE__ */ f.jsx(qt, { label: "审计事件", value: String(s.events.length), detail: `revision ${s.revision || 0}` }),
      /* @__PURE__ */ f.jsx(qt, { label: "研究运行", value: String(s.counts.researchRuns || 0), detail: "redacted" }),
      /* @__PURE__ */ f.jsx(qt, { label: "回测", value: String(s.counts.backtests || 0), detail: "immutable" }),
      /* @__PURE__ */ f.jsx(qt, { label: "本地源", value: "Blocked", detail: "prototype gate" })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "audit", children: [
      /* @__PURE__ */ f.jsx("h2", { children: "最近事件" }),
      s.events.map((r) => /* @__PURE__ */ f.jsxs("div", { children: [
        /* @__PURE__ */ f.jsx("time", { children: Xf(r.at) }),
        /* @__PURE__ */ f.jsx("b", { children: r.action }),
        /* @__PURE__ */ f.jsx("span", { children: r.actor })
      ] }, r.id))
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "notice", children: [
      /* @__PURE__ */ f.jsx("strong", { children: "同花顺 BYOK" }),
      /* @__PURE__ */ f.jsx("span", { children: _?.authentication || "missing" }),
      /* @__PURE__ */ f.jsxs("p", { children: [
        _?.reason,
        "。Key 与 AI 开关仅能在宿主插件设置中修改；AI 默认关闭。"
      ] })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { className: "notice", children: [
      /* @__PURE__ */ f.jsx("strong", { children: "Provider 单元" }),
      /* @__PURE__ */ f.jsx("span", { children: m.cells.length }),
      /* @__PURE__ */ f.jsx("p", { children: "敏感配置与未授权原始数据不会进入诊断输出。" })
    ] })
  ] });
}
function ov({ status: s, quote: m, portfolio: _, monitors: r, loading: O }) {
  const C = m.snapshot?.rows?.[0];
  return /* @__PURE__ */ f.jsxs("div", { className: "widget", children: [
    /* @__PURE__ */ f.jsxs("header", { children: [
      /* @__PURE__ */ f.jsx("h1", { children: "Finance" }),
      /* @__PURE__ */ f.jsx(Ba, { state: O ? "loading" : m.snapshot?.stale ? "stale" : "ready" })
    ] }),
    /* @__PURE__ */ f.jsxs("section", { children: [
      /* @__PURE__ */ f.jsx("span", { children: m.asset?.name || "加载中" }),
      /* @__PURE__ */ f.jsx("strong", { children: C ? Bt(C.price) : "--" }),
      /* @__PURE__ */ f.jsx("small", { children: C ? fi(C.price / C.previousClose - 1) : "" })
    ] }),
    /* @__PURE__ */ f.jsxs("div", { className: "widget-grid", children: [
      /* @__PURE__ */ f.jsx(qt, { label: "持仓", value: String(_.positions?.length || 0), detail: "local" }),
      /* @__PURE__ */ f.jsx(qt, { label: "任务", value: String(r.length), detail: "scheduled" })
    ] }),
    /* @__PURE__ */ f.jsxs("footer", { children: [
      s.marketDump?.status || "blocked",
      " local source"
    ] })
  ] });
}
function qt({ label: s, value: m, detail: _ }) {
  return /* @__PURE__ */ f.jsxs("div", { className: "metric", children: [
    /* @__PURE__ */ f.jsx("span", { children: s }),
    /* @__PURE__ */ f.jsx("strong", { children: m }),
    /* @__PURE__ */ f.jsx("small", { children: _ })
  ] });
}
function Ba({ state: s }) {
  return /* @__PURE__ */ f.jsx("span", { className: `status ${s || "unknown"}`, children: s || "unknown" });
}
function hv({ counts: s }) {
  return /* @__PURE__ */ f.jsx("div", { className: "status-strip", children: Object.entries(s).map(([m, _]) => /* @__PURE__ */ f.jsxs("span", { children: [
    /* @__PURE__ */ f.jsx("i", { className: m }),
    m,
    " ",
    String(_)
  ] }, m)) });
}
function mv({ rows: s }) {
  const m = s.length > 1 ? s.map((O) => O.close) : [s[0]?.low, s[0]?.open, s[0]?.price, s[0]?.high].filter(Boolean), _ = Math.min(...m), r = Math.max(...m);
  return /* @__PURE__ */ f.jsx("div", { className: "spark", "aria-label": "价格范围图", children: m.map((O, C) => /* @__PURE__ */ f.jsx("i", { style: { height: `${20 + (O - _) / (r - _ || 1) * 70}%` } }, C)) });
}
function Vu({ text: s }) {
  return /* @__PURE__ */ f.jsx("div", { className: "empty", children: s });
}
function Mt(s) {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) };
}
function Bt(s) {
  const m = Number(s);
  return Number.isFinite(m) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(m) : "--";
}
function vv(s) {
  const m = Number(s);
  return Number.isFinite(m) ? new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(m) : "--";
}
function fi(s) {
  const m = Number(s);
  return Number.isFinite(m) ? `${m >= 0 ? "+" : ""}${(m * 100).toFixed(2)}%` : "--";
}
function Xf(s) {
  const m = new Date(String(s));
  return Number.isFinite(m.getTime()) ? m.toLocaleString("zh-CN", { hour12: !1 }) : "--";
}
const ih = document.getElementById("root");
ih && C0.createRoot(ih).render(/* @__PURE__ */ f.jsx(av, {}));
