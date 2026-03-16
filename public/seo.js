/**
 * TracPost SEO Script — On-Page Injection
 * Lightweight (~2KB) script that injects missing SEO elements.
 * Usage: <script src="https://cdn.tracpost.com/seo.js" data-site="SITE_ID" data-key="API_KEY"></script>
 */
(function () {
  "use strict";

  var TRACPOST_API = "https://tracpost.com/api/seo/payload";
  var script = document.currentScript;
  if (!script) return;

  var siteId = script.getAttribute("data-site");
  var apiKey = script.getAttribute("data-key");
  if (!siteId || !apiKey) return;

  var url = encodeURIComponent(window.location.href);
  var endpoint =
    TRACPOST_API +
    "?url=" +
    url +
    "&site_id=" +
    siteId +
    "&api_key=" +
    apiKey;

  // Use XMLHttpRequest for maximum compatibility
  var xhr = new XMLHttpRequest();
  xhr.open("GET", endpoint, true);
  xhr.timeout = 8000;
  xhr.onload = function () {
    if (xhr.status !== 200) return;
    try {
      var data = JSON.parse(xhr.responseText);
      inject(data);
    } catch (e) {
      // Silently fail — never break the host page
    }
  };
  xhr.onerror = function () {};
  xhr.ontimeout = function () {};
  xhr.send();

  function inject(payload) {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) return;

    // Inject JSON-LD schema (only types not already present)
    if (payload.schema && payload.schema.length > 0) {
      var existingTypes = getExistingJsonLdTypes();
      for (var i = 0; i < payload.schema.length; i++) {
        var schema = payload.schema[i];
        var type = (schema["@type"] || "").toLowerCase();
        if (type && existingTypes.indexOf(type) === -1) {
          var el = document.createElement("script");
          el.type = "application/ld+json";
          el.textContent = JSON.stringify(schema);
          el.setAttribute("data-tracpost", "true");
          head.appendChild(el);
        }
      }
    }

    // Inject meta description (only if missing)
    if (payload.meta && payload.meta.description) {
      if (!document.querySelector('meta[name="description"]')) {
        appendMeta("name", "description", payload.meta.description);
      }
    }

    // Inject OG tags (only if missing)
    if (payload.og) {
      if (payload.og.title && !document.querySelector('meta[property="og:title"]')) {
        appendMeta("property", "og:title", payload.og.title);
      }
      if (payload.og.description && !document.querySelector('meta[property="og:description"]')) {
        appendMeta("property", "og:description", payload.og.description);
      }
      if (payload.og.image && !document.querySelector('meta[property="og:image"]')) {
        appendMeta("property", "og:image", payload.og.image);
      }
      if (payload.og.url && !document.querySelector('meta[property="og:url"]')) {
        appendMeta("property", "og:url", payload.og.url);
      }
      if (payload.og.type && !document.querySelector('meta[property="og:type"]')) {
        appendMeta("property", "og:type", payload.og.type);
      }
    }

    // Inject canonical (only if missing)
    if (payload.canonical) {
      if (!document.querySelector('link[rel="canonical"]')) {
        var link = document.createElement("link");
        link.rel = "canonical";
        link.href = payload.canonical;
        link.setAttribute("data-tracpost", "true");
        head.appendChild(link);
      }
    }
  }

  function appendMeta(attrName, attrValue, content) {
    var head = document.head || document.getElementsByTagName("head")[0];
    var meta = document.createElement("meta");
    meta.setAttribute(attrName, attrValue);
    meta.setAttribute("content", content);
    meta.setAttribute("data-tracpost", "true");
    head.appendChild(meta);
  }

  function getExistingJsonLdTypes() {
    var types = [];
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent || "");
        if (Array.isArray(data)) {
          for (var j = 0; j < data.length; j++) {
            if (data[j]["@type"]) types.push(data[j]["@type"].toLowerCase());
          }
        } else {
          if (data["@type"]) types.push(data["@type"].toLowerCase());
          if (data["@graph"] && Array.isArray(data["@graph"])) {
            for (var k = 0; k < data["@graph"].length; k++) {
              if (data["@graph"][k]["@type"])
                types.push(data["@graph"][k]["@type"].toLowerCase());
            }
          }
        }
      } catch (e) {
        // Skip malformed JSON-LD
      }
    }
    return types;
  }
})();
