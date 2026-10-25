/* 第三方 SDK 只在评论 iframe 内运行；显式文章标识防止静态嵌入页串评论。 */
(() => {
  const channel = "resource-comments";
  const notify = (type, extra = {}) =>
    parent.postMessage({ channel, type, ...extra }, location.origin);
  const fail = () => notify("error");
  let input;
  try {
    input = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  } catch {
    fail();
    return;
  }
  const { config, page } = input;
  if (
    !config ||
    !page ||
    typeof page.id !== "string" ||
    typeof page.url !== "string" ||
    typeof page.title !== "string"
  ) {
    fail();
    return;
  }
  const root = document.getElementById("comments");
  let preferences = { locale: input.locale, theme: input.theme };
  let waline;
  const language = () =>
    ({ "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en" })[
      preferences.locale
    ] || "zh-CN";
  const giscusLanguage = () =>
    ({ "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en" })[
      preferences.locale
    ] || "zh-CN";
  const applyPreferences = () => {
    document.documentElement.classList.toggle(
      "dark",
      preferences.theme === "dark",
    );
    document.documentElement.lang = language();
    document.documentElement.dataset.theme =
      preferences.theme === "dark" ? "dark" : "light";
    waline?.update({
      path: page.id,
      lang: language(),
      dark: preferences.theme === "dark",
    });
    const frame = root.querySelector("iframe.giscus-frame");
    frame?.contentWindow?.postMessage(
      {
        giscus: {
          setConfig: {
            theme: preferences.theme === "dark" ? "dark" : "light",
            lang: giscusLanguage(),
          },
        },
      },
      "https://giscus.app",
    );
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.origin !== location.origin ||
      event.data?.channel !== channel ||
      event.data.type !== "preferences"
    )
      return;
    preferences = { locale: event.data.locale, theme: event.data.theme };
    applyPreferences();
  });
  applyPreferences();
  document.title = page.title;
  const script = (url, attributes = {}) =>
    new Promise((resolve, reject) => {
      const node = document.createElement("script");
      node.src = url;
      node.async = true;
      for (const [key, value] of Object.entries(attributes))
        node.setAttribute(key, String(value));
      node.onload = resolve;
      node.onerror = reject;
      root.appendChild(node);
    });
  const css = (url) =>
    new Promise((resolve, reject) => {
      const node = document.createElement("link");
      node.rel = "stylesheet";
      node.href = url;
      node.onload = resolve;
      node.onerror = reject;
      document.head.appendChild(node);
    });
  // 只测内容高度，避免 iframe 视口高度反馈造成持续增长；隐藏页签的零高度不覆盖预留值。
  let lastHeight = 0;
  new ResizeObserver(() => {
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      notify("height", { height });
    }
  }).observe(root);
  const boot = async () => {
    switch (config.provider) {
      case "giscus":
        root.className = "giscus";
        await script("https://giscus.app/client.js", {
          "data-repo": config.repo,
          "data-repo-id": config.repoId,
          "data-category": config.category,
          "data-category-id": config.categoryId,
          "data-mapping": "specific",
          "data-term": page.id,
          "data-strict": "1",
          "data-reactions-enabled": config.reactions ? "1" : "0",
          "data-input-position": "top",
          "data-theme": preferences.theme === "dark" ? "dark" : "light",
          "data-lang": giscusLanguage(),
          crossorigin: "anonymous",
        });
        break;
      case "waline": {
        if (!/^\d+\.\d+\.\d+$/.test(config.version)) throw new Error("version");
        const base = `https://cdn.jsdelivr.net/npm/@waline/client@${config.version}/dist/`;
        const [, client] = await Promise.all([
          css(base + "waline.css"),
          import(base + "waline.js"),
        ]);
        waline = client.init({
          el: root,
          serverURL: config.serverURL,
          path: page.id,
          lang: language(),
          dark: preferences.theme === "dark",
          login: config.login,
          requiredMeta: config.requiredMeta,
          pageview: false,
          comment: false,
        });
        break;
      }
      case "twikoo":
        if (!/^\d+\.\d+\.\d+$/.test(config.version)) throw new Error("version");
        await script(
          `https://cdn.jsdelivr.net/npm/twikoo@${config.version}/dist/twikoo${/^https?:\/\//.test(config.envId) ? "" : ".all"}.min.js`,
        );
        await window.twikoo.init({
          el: root,
          envId: config.envId,
          href: page.url,
          region: config.region,
          path: page.id,
          lang: language(),
        });
        break;
      case "livere": {
        root.id = "lv-container";
        root.setAttribute("data-id", "city");
        root.setAttribute("data-uid", config.uid);
        window.livereOptions = { refer: page.id, site: page.url };
        await script("https://cdn-city.livere.com/js/embed.dist.js");
        break;
      }
      case "disqus":
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.shortname))
          throw new Error("shortname");
        root.id = "disqus_thread";
        window.disqus_config = function () {
          this.page.identifier = page.id;
          this.page.url = page.url;
          this.page.title = page.title;
          this.language = { "zh-CN": "zh", "zh-TW": "zh_TW", en: "en" }[
            language()
          ];
        };
        await script(`https://${config.shortname}.disqus.com/embed.js`);
        break;
      default:
        throw new Error("provider");
    }
    notify("loaded");
    applyPreferences();
  };
  boot().catch(fail);
  window.addEventListener("pagehide", () => waline?.destroy(), { once: true });
})();
