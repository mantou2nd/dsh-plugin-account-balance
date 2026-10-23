window.__ModuleLoader__.load({
	id: "dsh-plugin-account-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const ReactDOM = require("react-dom");

		/** Composer dock slot owned by client-ui-conversation. */
		const SLOT = "conversation.composer.dock";
		/** Entry id; a fresh id keeps every shipped dock entry in place. */
		const ENTRY_ID = "account-balance";
		/** Client build version reported to Platform on account calls. */
		const CLIENT_VERSION = "0.2.1-rc.2";
		/** How often the pill re-reads the balance while it stays mounted. */
		const REFRESH_MS = 30000;
		/** Below this many minor units the balance reads as low and turns red. */
		const LOW_BALANCE_CENTS = 500;
		/** Per-Session baseline of the wallet total this Session started from. */
		const STORAGE_PREFIX = "dsh-account-balance.base.";
		/** Distance between the trigger and the panel. */
		const PANEL_GAP = 8;
		/** Viewport margin the placement clamp keeps. */
		const PANEL_MARGIN = 12;
		/** Stylesheet identity, following the shipped plugin-css convention. */
		const STYLE_ID = "dsh-plugin-account-balance";
		/** Caption color every dock statistic uses. */
		const TERTIARY = "var(--dsw-alias-label-tertiary, #8b8b8b)";

		/** Inline stylesheet for the trigger and the detail panel. */
		const STYLES = [
			".dshab-trigger{box-sizing:border-box;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:6px;padding:1px 8px;border-radius:var(--dsw-radius-sm);white-space:nowrap;cursor:pointer;transition:background-color .1s,color .1s}",
			".dshab-trigger:hover,.dshab-trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dshab-panel{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px}",
			".dshab-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
			".dshab-titleValue{font-variant-numeric:tabular-nums}",
			".dshab-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}",
			".dshab-row{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;padding:2px 0}",
			".dshab-key{color:var(--dsw-alias-label-tertiary);min-width:0}",
			".dshab-value{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}",
			".dshab-note{color:var(--dsw-alias-label-tertiary);text-align:right;padding-bottom:4px}",
			".dshab-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;color:var(--dsw-alias-label-tertiary)}",
			".dshab-actions{display:flex;gap:8px;margin-top:12px}",
			".dshab-action{appearance:none;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-sm);padding:3px 10px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}",
			".dshab-action:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dshab-link{border:0;padding:0;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer;font:inherit}",
			".dshab-link:hover{color:var(--dsw-alias-label-primary)}"
		].join("\n");

		/** Inject the stylesheet once per page. */
		function installStyles() {
			if (typeof document === "undefined" || document.head === void 0) return;
			if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = STYLE_ID;
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = STYLES;
			document.head.appendChild(tag);
		}

		/** @param currency - Platform wallet currency. @returns its symbol. */
		function currencySymbol(currency) {
			return currency === "USD" ? "$" : "\u00a5";
		}

		/**
		 * Truncate a decimal balance string to whole cents.
		 *
		 * Platform Web displays wallet balances rounded DOWN, so rounding here
		 * would read one cent high whenever the third decimal is 5 or more (and
		 * `Number(x) * 100` adds its own float error on top). Parsing the digits
		 * keeps the arithmetic exact too.
		 * @param text - decimal balance string from the Host wallet projection.
		 * @returns whole cents, never NaN.
		 */
		function toCents(text) {
			const value = String(text === null || text === void 0 ? "" : text).trim();
			const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value);
			if (match === null) return 0;
			const sign = match[1] === "-" ? -1 : 1;
			const fraction = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
			return sign * (Number(match[2]) * 100 + Number(fraction));
		}

		/**
		 * Platform Web currency text: two decimals, sub-cent amounts below one.
		 * @param cents - non-negative amount in cents.
		 * @param symbol - currency symbol.
		 * @returns display text.
		 */
		function formatCents(cents, symbol) {
			if (!(cents > 0)) return symbol + "0.00";
			if (cents < 1) return "<" + symbol + "0.01";
			const whole = Math.floor(cents / 100).toLocaleString("en-US");
			const fraction = String(cents % 100).padStart(2, "0");
			return symbol + whole + "." + fraction;
		}

		/**
		 * Fold the Host wallet projection into one row per currency.
		 * @param balance - a "ready" getBalance value.
		 * @returns per-currency recharge, bonus and total cents.
		 */
		function summarize(balance) {
			const rows = new Map();
			const add = (wallet, field) => {
				if (wallet === null || typeof wallet !== "object") return;
				const row = rows.get(wallet.currency) ?? { currency: wallet.currency, recharge: 0, bonus: 0 };
				row[field] += toCents(wallet.balance);
				rows.set(wallet.currency, row);
			};
			for (const wallet of balance.value ?? []) add(wallet, "recharge");
			for (const wallet of balance.bonusWallets ?? []) add(wallet, "bonus");
			return [...rows.values()].map((row) => ({
				currency: row.currency,
				recharge: row.recharge,
				bonus: row.bonus,
				total: row.recharge + row.bonus
			}));
		}

		/**
		 * Read this Session's stored starting total.
		 * @param sessionId - owning Session.
		 * @returns currency to cents, or null when nothing is stored.
		 */
		function readBase(sessionId) {
			try {
				const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
				const parsed = raw === null ? null : JSON.parse(raw);
				return parsed !== null && typeof parsed === "object" ? parsed : null;
			} catch {
				return null;
			}
		}

		/** @param sessionId - owning Session. @param base - currency to cents. */
		function writeBase(sessionId, base) {
			try {
				localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(base));
			} catch {}
		}

		/**
		 * Baseline for one Session: the first total seen, raised by later top-ups
		 * so a recharge never reads as negative spend.
		 * @param sessionId - owning Session.
		 * @param wallets - current per-currency totals.
		 * @returns currency to cents.
		 */
		function ensureBase(sessionId, wallets) {
			if (sessionId === undefined || sessionId === null) return {};
			const stored = readBase(sessionId);
			const base = {};
			let changed = stored === null;
			for (const wallet of wallets) {
				const previous = stored === null ? void 0 : stored[wallet.currency];
				if (typeof previous === "number" && previous >= wallet.total) base[wallet.currency] = previous;
				else {
					base[wallet.currency] = wallet.total;
					changed = true;
				}
			}
			if (changed) writeBase(sessionId, base);
			return base;
		}

		/**
		 * Spend since the Session baseline.
		 * @param wallets - current per-currency totals.
		 * @param base - currency to cents.
		 * @returns per-currency spend in cents.
		 */
		function spendOf(wallets, base) {
			return wallets.map((wallet) => ({
				currency: wallet.currency,
				cents: Math.max(0, (base[wallet.currency] ?? wallet.total) - wallet.total)
			}));
		}

		/** @param count - token count. @returns a short 1.2M / 34K / 900 label. */
		function compactTokens(count) {
			if (count >= 1e6) return (count / 1e6).toFixed(count >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
			if (count >= 1e3) return Math.round(count / 1e3) + "K";
			return String(count);
		}

		/** @param usage - one provider usage sample. @returns its billed token total. */
		function usageTokens(usage) {
			if (usage === null || typeof usage !== "object") return 0;
			if (typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)) return usage.totalTokens;
			return (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) + (usage.outputTokens ?? 0);
		}

		/**
		 * Token share of the latest Turn, for allocating the Session's measured spend.
		 * @param nodes - chat snapshot nodes.
		 * @param usage - the whole-log tokenUsage projection, when served.
		 * @returns the latest Turn number, its tokens and its share of the log.
		 */
		function latestTurn(nodes, usage) {
			if (!Array.isArray(nodes)) return null;
			let turn = null;
			let tokens = 0;
			let visible = 0;
			for (const node of nodes) {
				if (node === null || typeof node !== "object" || node.kind !== "assistant") continue;
				const count = usageTokens(node.usage);
				visible += count;
				if (turn === null || node.turn > turn) {
					turn = node.turn;
					tokens = count;
				} else if (node.turn === turn) tokens += count;
			}
			if (turn === null) return null;
			const total = usage === void 0 || usage === null ? visible : usageTokens(usage);
			if (!(total > 0)) return null;
			return { turn, tokens, share: Math.min(1, tokens / total) };
		}

		/**
		 * Build the pill component for one plugin context.
		 * @param ctx - client plugin context.
		 * @returns a composer dock entry.
		 */
		function createPill(ctx) {
			const metadata = () => ({
				version: CLIENT_VERSION,
				locale: ctx.locale.getSnapshot().active,
				timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
			});

			/** @returns wallets for a signed-in account, otherwise null. */
			async function read() {
				try {
					const result = await ctx.remote.account.getBalance(metadata());
					const value = result !== null && result !== void 0 && result.ok ? result.value : null;
					if (value === null || value === void 0 || value.status !== "ready") return null;
					const wallets = summarize(value);
					return wallets.length > 0 ? wallets : null;
				} catch {
					return null;
				}
			}

			const t = (zh, en) => ((ctx.locale.getSnapshot().active ?? "").startsWith("zh") ? zh : en);

			return function AccountBalancePill(props) {
				const sessionId = props === null || props === void 0 ? void 0 : props.sessionId;
				const [view, setView] = React.useState(null);
				const [open, setOpen] = React.useState(false);
				const [links, setLinks] = React.useState(null);
				const [seat, setSeat] = React.useState(null);
				const nodes = typeof (props === null || props === void 0 ? void 0 : props.useChat) === "function" ? props.useChat((state) => state.legacy.nodes) : void 0;
				const wholeLog = typeof (props === null || props === void 0 ? void 0 : props.useProjection) === "function" ? props.useProjection("tokenUsage") : void 0;
				const anchorRef = React.useRef(null);
				const panelRef = React.useRef(null);
				const pullRef = React.useRef(null);

				React.useEffect(() => {
					let live = true;
					const pull = async () => {
						const wallets = await read();
						if (!live) return;
						if (wallets === null) {
							setView(null);
							return;
						}
						const base = ensureBase(sessionId, wallets);
						setView({ wallets, spend: spendOf(wallets, base), at: Date.now() });
					};
					const onVisible = () => {
						if (document.visibilityState === "visible") pull();
					};
					pullRef.current = pull;
					pull();
					const timer = setInterval(pull, REFRESH_MS);
					document.addEventListener("visibilitychange", onVisible);
					window.addEventListener("focus", onVisible);
					return () => {
						live = false;
						pullRef.current = null;
						clearInterval(timer);
						document.removeEventListener("visibilitychange", onVisible);
						window.removeEventListener("focus", onVisible);
					};
				}, [sessionId]);

				React.useEffect(() => {
					// Opening the panel is also a "show me now" request: read a fresh balance.
					if (open && pullRef.current !== null) pullRef.current();
				}, [open]);

				React.useEffect(() => {
					if (!open) {
						setSeat(null);
						return;
					}
					const place = () => {
						const anchor = anchorRef.current;
						const panel = panelRef.current;
						if (anchor === null || panel === null) return;
						const a = anchor.getBoundingClientRect();
						const p = panel.getBoundingClientRect();
						const left = Math.min(Math.max(a.left + a.width / 2 - p.width / 2, PANEL_MARGIN), Math.max(PANEL_MARGIN, window.innerWidth - p.width - PANEL_MARGIN));
						const above = a.top - p.height - PANEL_GAP;
						const top = above >= PANEL_MARGIN ? above : Math.max(PANEL_MARGIN, window.innerHeight - p.height - PANEL_MARGIN);
						setSeat({ left, top });
					};
					place();
					window.addEventListener("resize", place);
					window.addEventListener("scroll", place, true);
					return () => {
						window.removeEventListener("resize", place);
						window.removeEventListener("scroll", place, true);
					};
				}, [open]);

				React.useEffect(() => {
					if (!open) return;
					const onKeyDown = (event) => {
						if (event.key === "Escape") setOpen(false);
					};
					const onPointer = (event) => {
						const target = event.target;
						if (anchorRef.current !== null && anchorRef.current.contains(target)) return;
						if (panelRef.current !== null && panelRef.current.contains(target)) return;
						setOpen(false);
					};
					document.addEventListener("keydown", onKeyDown);
					document.addEventListener("mousedown", onPointer, true);
					return () => {
						document.removeEventListener("keydown", onKeyDown);
						document.removeEventListener("mousedown", onPointer, true);
					};
				}, [open]);

				React.useEffect(() => {
					if (!open || links !== null) return;
					let live = true;
					(async () => {
						try {
							const result = await ctx.remote.account.getState();
							const value = result !== null && result !== void 0 && result.ok ? result.value : null;
							if (live && value !== null && value !== void 0 && value.links !== void 0) setLinks(value.links);
						} catch {}
					})();
					return () => {
						live = false;
					};
				}, [open, links]);

				if (view === null) return null;

				const wallets = view.wallets;
				const spend = view.spend;
				const symbolOf = (wallet) => currencySymbol(wallet.currency);
				const lowWallets = wallets.filter((wallet) => wallet.total < LOW_BALANCE_CENTS);
				const balanceText = wallets.map((wallet) => formatCents(wallet.total, symbolOf(wallet))).join(" \u00b7 ");
				const spendText = spend.map((row2) => formatCents(row2.cents, currencySymbol(row2.currency))).join(" \u00b7 ");
				const rechargeText = wallets.map((wallet) => formatCents(wallet.recharge, symbolOf(wallet))).join(" \u00b7 ");
				const bonusText = wallets.map((wallet) => formatCents(wallet.bonus, symbolOf(wallet))).join(" \u00b7 ");
				const low = lowWallets.length > 0;
				const turn = latestTurn(nodes, wholeLog);
				const turnSpend = turn === null ? null : spend.map((row2) => ({
					currency: row2.currency,
					cents: Math.round(row2.cents * turn.share)
				}));
				const turnText = turnSpend === null ? null : turnSpend.map((row2) => formatCents(row2.cents, currencySymbol(row2.currency))).join(" \u00b7 ");
				const sep = { color: "var(--dsw-alias-separator-primary, #3a3a3a)", margin: "0 1px" };

				const row = (key, value, id) => React.createElement("div", { className: "dshab-row", key: id },
					React.createElement("span", { className: "dshab-key" }, key),
					React.createElement("span", { className: "dshab-value" }, value));
				const rule = (id) => React.createElement("div", { className: "dshab-rule", key: id });
				const note = (text, id) => React.createElement("div", { className: "dshab-note", key: id }, text);

				const updatedAt = view.at === void 0 ? "" : new Date(view.at).toLocaleTimeString(ctx.locale.getSnapshot().active, { hour: "2-digit", minute: "2-digit" });

				const panel = open ? ReactDOM.createPortal(
					React.createElement("div", {
						className: "dshab-panel",
						role: "dialog",
						"aria-label": t("\u8d26\u6237\u4f59\u989d\u4e0e\u6d88\u8017", "Balance and spend"),
						ref: panelRef,
						style: seat === null ? { visibility: "hidden", left: 0, top: 0 } : seat,
						"data-composer-stat-panel": ENTRY_ID
					},
						React.createElement("div", { className: "dshab-title", key: "title" },
							React.createElement("span", null, t("\u8d26\u6237\u4f59\u989d", "Account balance")),
							React.createElement("span", { className: "dshab-titleValue" }, balanceText)),
						rule("r1"),
						row(t("\u5145\u503c\u4f59\u989d", "Topped-up"), rechargeText, "recharge"),
						row(t("\u8d60\u91d1\u4f59\u989d", "Granted"), bonusText, "bonus"),
						rule("r2"),
						row(t("\u4f1a\u8bdd\u6d88\u8017", "Session spend"), spendText, "spend"),
						note(t("\u81ea\u6253\u5f00\u8fd9\u4e2a\u4f1a\u8bdd\u8d77\u4f59\u989d\u7684\u51cf\u5c11", "balance drop since this session was opened"), "spendNote"),
						turnText === null ? null : row(t("\u672c\u8f6e\u4f30\u7b97", "This turn"), turnText, "turn"),
						turnText === null || turn === null ? null : note(t("\u672c\u8f6e ", "This turn ") + compactTokens(turn.tokens) + " tok \u00b7 " + t("\u5360\u4f1a\u8bdd ", "of session ") + Math.round(turn.share * 100) + "%", "turnNote"),
						rule("r3"),
						React.createElement("div", { className: "dshab-footer", key: "footer" },
							React.createElement("span", null, t("\u66f4\u65b0\u4e8e ", "Updated ") + updatedAt),
							React.createElement("button", {
								type: "button",
								className: "dshab-link",
								onClick: () => {
									if (pullRef.current !== null) pullRef.current();
								}
							}, t("\u5237\u65b0", "Refresh"))),
						links === null ? null : React.createElement("div", { className: "dshab-actions", key: "actions" },
							React.createElement("a", { className: "dshab-action", href: links.usageUrl, target: "_blank", rel: "noreferrer" }, t("\u67e5\u8be2\u7528\u91cf", "Usage")),
							React.createElement("a", { className: "dshab-action", href: links.topUpUrl, target: "_blank", rel: "noreferrer" }, t("\u53bb\u5145\u503c", "Top up")))
					),
					document.body
				) : null;

				return React.createElement("span", {
					"data-composer-stat": ENTRY_ID,
					ref: anchorRef,
					style: { display: "inline-flex" }
				},
					React.createElement("button", {
						type: "button",
						className: "dshab-trigger",
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						"aria-label": t("\u4f59\u989d ", "Balance ") + balanceText + t("\uff0c\u4f1a\u8bdd\u6d88\u8017 ", ", session spend ") + spendText + (turnText === null ? "" : t("\uff0c\u672c\u8f6e ", ", this turn ") + turnText),
						onClick: () => setOpen((value) => !value)
					},
						React.createElement("span", { key: "balance", style: { color: low ? "var(--dsw-alias-state-error-primary, #ec1313)" : TERTIARY } }, t("\u4f59\u989d ", "Balance ") + balanceText),
						React.createElement("span", { key: "sep1", "aria-hidden": true, style: sep }, "\u00b7"),
						React.createElement("span", { key: "spend", style: { color: TERTIARY } }, t("\u4f1a\u8bdd ", "Session ") + spendText),
						turnText === null ? null : React.createElement("span", { key: "sep2", "aria-hidden": true, style: sep }, "\u00b7"),
						turnText === null ? null : React.createElement("span", { key: "turn", style: { color: TERTIARY } }, t("\u672c\u8f6e ", "This turn ") + turnText)),
					panel
				);
			};
		}

		/** Services the pill needs. */
		const inject = ["slots", "locale", "remote", "remote.account"];

		/**
		 * Register the pill in the composer dock, below the composer card.
		 * @param ctx - client plugin context.
		 */
		function apply(ctx) {
			installStyles();
			ctx.slots.inject(SLOT, () => ctx.slots.register({
				name: SLOT,
				id: ENTRY_ID,
				order: 2
			}, createPill(ctx)));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__helpers = { TERTIARY, summarize, formatCents, toCents, currencySymbol, ensureBase, spendOf, readBase, writeBase, usageTokens, latestTurn, compactTokens };
		return module.exports;
	}
});
