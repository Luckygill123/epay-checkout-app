const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let catalogData = "epay data";

app.get("/", (req, res) => {
  console.log("Backend Running", req);
  res.send("Backend Running");
});

app.get("/products", async (req, res) => {
  // res.send("products Running");

  try {
    console.log("request00");
    // axios.get(`https://testserver-iota.vercel.app/getDataV2`).then((response) => {
    //        catalogData = response.data;
    //       console.log('catalogData00', catalogData)

    //     });

    const sanitizeXML = (xml) => {
      const tagsToClean = [
        "INFOJSON",
        "TERMS_AND_CONDITIONS",
        "DESCRIPTION_LONG",
        "DESCRIPTION_SHORT",
        "DESCRIPTION_REDEMPTION",
      ];

      tagsToClean.forEach((tag) => {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
        xml = xml.replace(regex, (_, content) => {
          return `<${tag}>${content
            .replace(/\n/g, "[LINE_FEED]")
            .replace(/\t/g, " ")}</${tag}>`;
        });
      });

      return xml
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&copy;/g, "©")
        .replace(/&trade;/g, "™")
        .replace(/&reg;/g, "®");
    };

    const getText = (parent, tag) => {
      const el = parent.getElementsByTagName(tag);
      // return el.length ? el[0].textContent.trim() : "";
      return el.length && el[0] && typeof el[0].value === "string"
        ? el[0].value.trim()
        : "";
    };

    const getAttr = (parent, tag, attr) => {
      const el = parent.getElementsByTagName(tag);
      // return el.length ? el[0].getAttribute(attr) || "" : "";
      return el.length && el[0] && el[0].attributes
        ? el[0].attributes[attr] || ""
        : "";
    };

    const mapLegacyInfo = (info) => {
      return {
        BRAND: [getText(info, "BRAND")],
        COMPANY: [getText(info, "COMPANY")],
        DESCRIPTION_SHORT: [getText(info, "DESCRIPTION_SHORT")],
        DESCRIPTION_LONG: [getText(info, "DESCRIPTION_LONG")],
        DESCRIPTION_REDEMPTION: [getText(info, "DESCRIPTION_REDEMPTION")],
        TERMS_AND_CONDITIONS: [getText(info, "TERMS_AND_CONDITIONS")],
        TECHNICAL_INFORMATION: [getText(info, "TECHNICAL_INFORMATION")],
        DISPLAY_NAME: [getText(info, "DISPLAY_NAME")],
      };
    };

    const extractLegacyInfo = (article, lang) => {
      const infos = article.getElementsByTagName("INFO");

      let fallback = null;

      for (let i = 0; i < infos.length; i++) {
        const info = infos[i];

        const language =
          getText(info, "LANGUAGE") || getText(info, "language") || "en";

        if (language === lang || language.startsWith(lang)) {
          return mapLegacyInfo(info);
        }

        // Save English as fallback
        if (!fallback && (language === "en" || language === "eng")) {
          fallback = mapLegacyInfo(info);
        }
      }

      return fallback;
    };

    const extractCategoryFromInfo = (info) => {
      try {
        if (!info) {
          return "Others";
        }

        const tech = info.TECHNICAL_INFORMATION?.[0];

        if (!tech || typeof tech !== "string") {
          return "Others";
        }

        const match = tech.match(/PRODUCTCATEGORY=([^,]+)/);

        return match ? match[1] : "Others";
      } catch (err) {
        console.log("CATEGORY ERROR:", err.message);

        return "Others";
      }
    };

    const extractArticleInfo = (article, lang = "en") => {
      // ---------- Try INFOSJSON first ----------
      const infosJsonNode = article.getElementsByTagName("INFOSJSON");

      if (
        infosJsonNode.length > 0 &&
        infosJsonNode[0] &&
        infosJsonNode[0].value &&
        infosJsonNode[0].value !== "{}"
      ) {
        try {
          const parsed = JSON.parse(infosJsonNode[0].value);

          if (parsed[lang]) {
            return parsed[lang];
          }
        } catch (e) {
          console.warn("Invalid INFOSJSON, falling back to INFOS");
        }
      }

      // ---------- Fallback to legacy INFOS ----------
      return extractLegacyInfo(article, lang);
    };

    // const getLanguage = () => {
    //   return document.documentElement.lang === "ar" ? "ar" : "en";
    // };

    const getLanguage = (req) => {
      const langHeader = req.headers["accept-language"] || "";

      return langHeader.includes("ar") ? "ar" : "en";
    };

    const extractEpayProducts = (xmlTree, req) => {
      const lang = getLanguage(req);

      const articles = xmlTree.getElementsByTagName("ARTICLE");

      const products = [];

      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];

        if (getText(a, "ENABLED") !== "1") continue;

        const type = getText(a, "TYPE");
        if (!["PIN", "POSA"].includes(type)) continue;

        const amount = getText(a, "AMOUNT");
        const EAN = getText(a, "EAN");
        const VAT = getText(a, "VAT");
        const maxAmount = getAttr(a, "AMOUNT", "MAXAMOUNT");
        const minAmount = getAttr(a, "AMOUNT", "MINAMOUNT");
        const currency_number = getAttr(a, "AMOUNT", "CURRENCY") || "";

        if (amount === "0" && maxAmount === "0") continue;

        const image =
          getText(a, "PROVIDER_LOGO").includes("joker") ||
          getText(a, "PROVIDER_LOGO").includes("akani?")
            ? getText(a, "ARTICLE_IMAGE")
            : getText(a, "PROVIDER_LOGO") ||
                getText(a, "ARTICLE_IMAGE").includes("153804-Steam-20-AED")
              ? getText(a, "PROVIDER_LOGO")
              : getText(a, "ARTICLE_IMAGE") || getText(a, "LOGO");

        if (!image) continue;

        const info = extractArticleInfo(a, lang);

        if (!info || !info.BRAND?.[0]) continue;

        // if (!isInfoComplete(info)) {
        //   console.warn("❌ Incomplete info for lang:", lang, info);
        //   continue;
        // }
        const category = extractCategoryFromInfo(info);

        products.push({
          name: info.DISPLAY_NAME?.[0] || getText(a, "NAME"),
          provider: info.BRAND[0],
          category,
          amount,
          maxAmount,
          minAmount,
          EAN,
          VAT,
          currency: currency_number,
          image,
          shortDesc: info.DESCRIPTION_SHORT?.[0] || "",
          longDesc: info.DESCRIPTION_LONG?.[0] || "",
        });
      }

      // console.log("valid_products", products, products.length);
      return products;
    };

    class VanillaXMLParser {
      constructor() {}

      parseFromString(xmlText) {
        return this._parseFromString(xmlText);
      }

      _parseFromString(xmlText) {
        xmlText = this._encodeCDATAValues(xmlText);

        var cleanXmlText = xmlText
          .replace(/\s{2,}/g, " ")
          .replace(/[\t\n\r]/g, "")
          .replace(/>/g, ">\n")
          .replace(/\]\]/g, "]]\n");

        var rawXmlData = [];

        cleanXmlText.split("\n").forEach((element) => {
          element = element.trim();

          if (!element || element.indexOf("?xml") > -1) return;

          if (element.indexOf("<") === 0 && element.indexOf("CDATA") < 0) {
            var parsedTag = this._parseTag(element);
            rawXmlData.push(parsedTag);

            if (element.match(/\/\s*>$/)) {
              rawXmlData.push(this._parseTag("</" + parsedTag.name + ">"));
            }
          } else {
            rawXmlData[rawXmlData.length - 1].value +=
              " " + this._parseValue(element);
          }
        });

        return this._convertTagsArrayToTree(rawXmlData)[0];
      }

      _encodeCDATAValues(xmlText) {
        var cdataRegex = /<!\[CDATA\[([^\]\]]+)\]\]/gi;
        var result = cdataRegex.exec(xmlText);

        while (result) {
          if (result[1]) {
            xmlText = xmlText.replace(result[1], encodeURIComponent(result[1]));
          }
          result = cdataRegex.exec(xmlText);
        }

        return xmlText;
      }

      _getElementsByTagName(tagName) {
        var matches = [];

        if (
          tagName === "*" ||
          this.name.toLowerCase() === tagName.toLowerCase()
        ) {
          matches.push(this);
        }

        this.children.forEach((child) => {
          matches = matches.concat(child.getElementsByTagName(tagName));
        });

        return matches;
      }

      _parseTag(tagText) {
        var cleanTagText = tagText.match(
          /([^\s]*)=('([^']*?)'|"([^"]*?)")|([\/?\w\-\:]+)/g,
        );

        var tag = {
          name: cleanTagText.shift().replace(/\/\s*$/, ""),
          attributes: {},
          children: [],
          value: "",
          getElementsByTagName: this._getElementsByTagName,
        };

        cleanTagText.forEach((attribute) => {
          var parts = attribute.split("=");
          if (parts.length < 2) return;

          var key = parts[0];
          var val = parts.slice(1).join("=");

          tag.attributes[key] = val
            .replace(/^["']/, "")
            .replace(/["']$/, "")
            .trim();
        });

        return tag;
      }

      _parseValue(tagValue) {
        if (tagValue.indexOf("CDATA") < 0) {
          return tagValue.trim();
        }

        return tagValue.substring(
          tagValue.lastIndexOf("[") + 1,
          tagValue.indexOf("]"),
        );
      }

      _convertTagsArrayToTree(xml) {
        var xmlTree = [];

        while (xml.length > 0) {
          var tag = xml.shift();

          if (tag.value.indexOf("</") > -1 || tag.name.match(/\/$/)) {
            tag.name = tag.name.replace(/\/$/, "").trim();
            tag.value = tag.value.substring(0, tag.value.indexOf("</")).trim();
            xmlTree.push(tag);
            continue;
          }

          if (tag.name.indexOf("/") === 0) break;

          xmlTree.push(tag);
          tag.children = this._convertTagsArrayToTree(xml);
          tag.value = decodeURIComponent(tag.value.trim());
        }

        return xmlTree;
      }

      toString(xml) {
        return this._toString(xml);
      }

      _toString(xml) {
        var xmlText = this._convertTagToText(xml);

        if (xml.children.length > 0) {
          xml.children.forEach((child) => {
            xmlText += this._toString(child);
          });
          xmlText += "</" + xml.name + ">";
        }

        return xmlText;
      }

      _convertTagToText(tag) {
        var tagText = "<" + tag.name;

        for (var attr in tag.attributes) {
          tagText += " " + attr + '="' + tag.attributes[attr] + '"';
        }

        tagText += ">";

        if (tag.value.length > 0) {
          tagText += tag.value;
        }

        if (tag.children.length === 0) {
          tagText += "</" + tag.name + ">";
        }

        return tagText;
      }
    }

    async function resolveCurrency(currency) {
      const currencyCodeMap = {
        "004": { currency: "AFN", symbol: "؋" },
        "008": { currency: "ALL", symbol: "L" },
        "012": { currency: "DZD", symbol: "دج" },
        "016": { currency: "USD", symbol: "$" },
        "020": { currency: "EUR", symbol: "€" },
        "024": { currency: "AOA", symbol: "Kz" },
        "028": { currency: "XCD", symbol: "$" },
        "032": { currency: "ARS", symbol: "$" },
        "036": { currency: "AUD", symbol: "$" },
        "040": { currency: "EUR", symbol: "€" },
        "044": { currency: "BSD", symbol: "$" },
        "048": { currency: "BHD", symbol: ".د.ب" },
        "050": { currency: "BDT", symbol: "৳" },
        "051": { currency: "AMD", symbol: "֏" },
        "052": { currency: "BBD", symbol: "$" },
        "056": { currency: "EUR", symbol: "€" },
        "060": { currency: "BMD", symbol: "$" },
        "064": { currency: "BTN", symbol: "Nu." },
        "068": { currency: "BOB", symbol: "Bs." },
        "070": { currency: "BAM", symbol: "KM" },
        "072": { currency: "BWP", symbol: "P" },
        "076": { currency: "BRL", symbol: "R$" },
        "084": { currency: "BZD", symbol: "$" },
        "090": { currency: "SBD", symbol: "$" },
        "096": { currency: "BND", symbol: "$" },
        100: { currency: "BGN", symbol: "лв" },
        104: { currency: "MMK", symbol: "Ks" },
        108: { currency: "BIF", symbol: "FBu" },
        116: { currency: "KHR", symbol: "៛" },
        120: { currency: "XAF", symbol: "FCFA" },
        124: { currency: "CAD", symbol: "$" },
        132: { currency: "CVE", symbol: "$" },
        136: { currency: "KYD", symbol: "$" },
        140: { currency: "XAF", symbol: "FCFA" },
        144: { currency: "LKR", symbol: "Rs" },
        148: { currency: "XAF", symbol: "FCFA" },
        152: { currency: "CLP", symbol: "$" },
        156: { currency: "CNY", symbol: "¥" },
        170: { currency: "COP", symbol: "$" },
        174: { currency: "KMF", symbol: "CF" },
        178: { currency: "XAF", symbol: "FCFA" },
        180: { currency: "CDF", symbol: "FC" },
        188: { currency: "CRC", symbol: "₡" },
        191: { currency: "EUR", symbol: "€" },
        192: { currency: "CUP", symbol: "$" },
        196: { currency: "EUR", symbol: "€" },
        203: { currency: "CZK", symbol: "Kč" },
        204: { currency: "DKK", symbol: "kr" },
        208: { currency: "DKK", symbol: "kr" },
        214: { currency: "DOP", symbol: "$" },
        218: { currency: "USD", symbol: "$" },
        222: { currency: "SVC", symbol: "$" },
        226: { currency: "XAF", symbol: "FCFA" },
        231: { currency: "ETB", symbol: "Br" },
        232: { currency: "ERN", symbol: "Nkf" },
        233: { currency: "EUR", symbol: "€" },
        238: { currency: "FKP", symbol: "£" },
        242: { currency: "FJD", symbol: "$" },
        246: { currency: "EUR", symbol: "€" },
        250: { currency: "EUR", symbol: "€" },
        262: { currency: "DJF", symbol: "Fdj" },
        266: { currency: "XAF", symbol: "FCFA" },
        268: { currency: "GEL", symbol: "₾" },
        270: { currency: "GMD", symbol: "D" },
        276: { currency: "EUR", symbol: "€" },
        288: { currency: "GHS", symbol: "₵" },
        292: { currency: "GIP", symbol: "£" },
        296: { currency: "AUD", symbol: "$" },
        300: { currency: "EUR", symbol: "€" },
        320: { currency: "GTQ", symbol: "Q" },
        324: { currency: "GNF", symbol: "FG" },
        328: { currency: "GYD", symbol: "$" },
        332: { currency: "HTG", symbol: "G" },
        340: { currency: "HNL", symbol: "L" },
        344: { currency: "HKD", symbol: "$" },
        348: { currency: "HUF", symbol: "Ft" },
        352: { currency: "ISK", symbol: "kr" },
        356: { currency: "INR", symbol: "₹" },
        360: { currency: "IDR", symbol: "Rp" },
        364: { currency: "IRR", symbol: "﷼" },
        368: { currency: "IQD", symbol: "ع.د" },
        372: { currency: "EUR", symbol: "€" },
        376: { currency: "ILS", symbol: "₪" },
        380: { currency: "EUR", symbol: "€" },
        388: { currency: "JMD", symbol: "$" },
        392: { currency: "JPY", symbol: "¥" },
        398: { currency: "KZT", symbol: "₸" },
        400: { currency: "JOD", symbol: "د.ا" },
        404: { currency: "KES", symbol: "Sh" },
        408: { currency: "KPW", symbol: "₩" },
        410: { currency: "KRW", symbol: "₩" },
        414: { currency: "KWD", symbol: "د.ك" },
        417: { currency: "KGS", symbol: "с" },
        418: { currency: "LAK", symbol: "₭" },
        422: { currency: "LBP", symbol: "ل.ل" },
        426: { currency: "LSL", symbol: "L" },
        428: { currency: "EUR", symbol: "€" },
        430: { currency: "LRD", symbol: "$" },
        434: { currency: "LYD", symbol: "ل.د" },
        440: { currency: "EUR", symbol: "€" },
        442: { currency: "EUR", symbol: "€" },
        446: { currency: "MOP", symbol: "P" },
        450: { currency: "MGA", symbol: "Ar" },
        454: { currency: "MWK", symbol: "MK" },
        458: { currency: "MYR", symbol: "RM" },
        462: { currency: "MVR", symbol: "Rf" },
        466: { currency: "XOF", symbol: "CFA" },
        470: { currency: "EUR", symbol: "€" },
        478: { currency: "MRU", symbol: "UM" },
        480: { currency: "MUR", symbol: "₨" },
        484: { currency: "MXN", symbol: "$" },
        496: { currency: "MNT", symbol: "₮" },
        498: { currency: "MDL", symbol: "L" },
        499: { currency: "EUR", symbol: "€" },
        504: { currency: "MAD", symbol: "د.م." },
        508: { currency: "MZN", symbol: "MT" },
        512: { currency: "OMR", symbol: "ر.ع." },
        516: { currency: "NAD", symbol: "$" },
        524: { currency: "NPR", symbol: "Rs" },
        528: { currency: "EUR", symbol: "€" },
        533: { currency: "AWG", symbol: "ƒ" },
        540: { currency: "XPF", symbol: "₣" },
        548: { currency: "VUV", symbol: "Vt" },
        554: { currency: "NZD", symbol: "$" },
        558: { currency: "NIO", symbol: "C$" },
        562: { currency: "XOF", symbol: "CFA" },
        566: { currency: "NGN", symbol: "₦" },
        578: { currency: "NOK", symbol: "kr" },
        586: { currency: "PKR", symbol: "₨" },
        590: { currency: "PAB", symbol: "B/." },
        598: { currency: "PGK", symbol: "K" },
        600: { currency: "PYG", symbol: "₲" },
        604: { currency: "PEN", symbol: "S/" },
        608: { currency: "PHP", symbol: "₱" },
        616: { currency: "PLN", symbol: "zł" },
        620: { currency: "EUR", symbol: "€" },
        634: { currency: "QAR", symbol: "ر.ق" },
        642: { currency: "RON", symbol: "lei" },
        643: { currency: "RUB", symbol: "₽" },
        646: { currency: "RWF", symbol: "FRw" },
        654: { currency: "SHP", symbol: "£" },
        682: { currency: "SAR", symbol: "﷼" },
        686: { currency: "XOF", symbol: "CFA" },
        690: { currency: "SCR", symbol: "₨" },
        694: { currency: "SLL", symbol: "Le" },
        702: { currency: "SGD", symbol: "$" },
        704: { currency: "VND", symbol: "₫" },
        706: { currency: "SOS", symbol: "Sh" },
        710: { currency: "ZAR", symbol: "R" },
        728: { currency: "SSP", symbol: "£" },
        752: { currency: "SEK", symbol: "kr" },
        756: { currency: "CHF", symbol: "CHF" },
        760: { currency: "SYP", symbol: "£" },
        764: { currency: "THB", symbol: "฿" },
        768: { currency: "XOF", symbol: "CFA" },
        780: { currency: "TTD", symbol: "$" },
        784: { currency: "AED", symbol: "د.إ" },
        788: { currency: "TND", symbol: "د.ت" },
        792: { currency: "TRY", symbol: "₺" },
        800: { currency: "UGX", symbol: "Sh" },
        804: { currency: "UAH", symbol: "₴" },
        807: { currency: "MKD", symbol: "ден" },
        818: { currency: "EGP", symbol: "£" },
        826: { currency: "GBP", symbol: "£" },
        834: { currency: "TZS", symbol: "Sh" },
        840: { currency: "USD", symbol: "$" },
        858: { currency: "UYU", symbol: "$" },
        860: { currency: "UZS", symbol: "soʻm" },
        882: { currency: "WST", symbol: "T" },
        886: { currency: "YER", symbol: "﷼" },
        894: { currency: "ZMW", symbol: "ZK" },
      };

      //import countryMap from "./code.json" with { type: 'json' };

      const getCurrencyInfo = (numericCountryCode, map) => {
        return map[String(numericCountryCode).padStart(3, "0")] ?? null;
      };

      const code = getCurrencyInfo(currency, currencyCodeMap);
      // console.log(`currency code is: ${code.currency} unicode symbol: ${code.symbol}`);
      return code;
    }

    async function attachCurrency(products) {
      const cache = {};
      let currency;
      for (const p of products) {
        if (!p.currency) continue;

        // 🔥 cache to avoid repeated API calls
        if (!cache[p.currency]) {
          try {
            if (p.currency.length == 2) {
              currency = `0${p.currency}`;
            } else {
              currency = p.currency;
            }
            cache[p.currency] = await resolveCurrency(currency);
          } catch {
            cache[p.currency] = { currency: "", symbol: "" };
          }
        }

        p.currencyIso = cache[p.currency].currency || "";
        p.currencySymbol = cache[p.currency].symbol || "";
      }

      return products;
    }

    const getOrderedCategories = (products) => {
      const categorySet = new Set();
      let hasOthers = false;

      for (const product of products) {
        let category = product.category?.trim();

        if (!category) {
          hasOthers = true;
        } else if (category === "Others") {
          hasOthers = true;
        } else {
          categorySet.add(category);
        }
      }

      const ordered = Array.from(categorySet).sort((a, b) =>
        a.localeCompare(b),
      );

      if (hasOthers) ordered.push("Others");

      return ordered;
    };

    const groupByCategory = (products) => {
      const map = {};

      for (const p of products) {
        const cat = p.category || "Others";
        if (!map[cat]) map[cat] = [];
        map[cat].push(p);
      }

      return map;
    };

    const groupByProvider = (products) => {
      const map = {};

      for (const p of products) {
        if (!map[p.provider]) {
          map[p.provider] = {
            provider: p.provider,
            count: 0,
            products: [],
          };
        }
        map[p.provider].count++;
        map[p.provider].products.push(p);
      }

      return Object.values(map);
    };

    // const renderCategoryWiseCatalog = (products) => {
    //   const root = document.createElement("epay-products");
    //   root.innerHTML = "";

    //   // 1️⃣ Order categories properly
    //   const orderedCategories = getOrderedCategories(products);
    //   console.log("orderedCategories--", orderedCategories);
    //   // 2️⃣ Group products by category
    //   const categoryMap = groupByCategory(products);

    //   // 3️⃣ Render category sections
    //   for (const categoryName of orderedCategories) {
    //     const categoryProducts = categoryMap[categoryName];
    //     if (!categoryProducts) continue;

    //     const section = document.createElement("section");
    //     section.className = "epay-category";

    //     const title = document.createElement("h2");
    //     title.textContent = categoryName;
    //     section.appendChild(title);

    //     const grid = document.createElement("div");
    //     grid.className = "epay-category-grid";

    //     // 4️⃣ Group providers inside category
    //     const providers = groupByProvider(categoryProducts);
    //     console.log("Providers:", providers);

    //     for (const provider of providers) {
    //         const card = document.createElement("div");
    //       card.className = "epay-card";

    //       card.onclick = () => {
    //         sessionStorage.setItem(
    //           "epay_products",
    //           JSON.stringify(provider.products)
    //         );
    //         sessionStorage.setItem(
    //           "epay_provider",
    //           provider.provider
    //         );

    //         const slug = provider.provider
    //           .toLowerCase()
    //           .replace(/\s+/g, "-");

    //         window.location.href =
    //           `/pages/epay-listing?provider=${slug}`;
    //       };

    //       card.innerHTML = `
    //         <div class="thumbnail-img">
    //           <img src="${provider.products[0].image}"  />
    //         </div>
    //         <h3>${provider.provider}</h3>
    //         <div class="epay-count">${provider.count}</div>
    //       `;

    //       grid.appendChild(card);

    //     }

    //     section.appendChild(grid);
    //     root.appendChild(section);
    //   }
    // };

    const renderCategoryWiseCatalog = (products) => {
      const orderedCategories = getOrderedCategories(products);

      const categoryMap = groupByCategory(products);

      return orderedCategories
        .map((categoryName) => {
          const categoryProducts = categoryMap[categoryName];

          if (!categoryProducts) return "";

          const providers = groupByProvider(categoryProducts);

          console.log("providers00", providers);

          return `

      <section class="epay-category">

        <h2 class="category-title">
          ${categoryName}
        </h2>

        <div class="epay-category-grid">

          ${providers
            .map(
              (product) => `

            <div class="epay-card"  onclick="buyNow()">
<div class="thumbnail-img">
              <img
                src="${product.products[0].image}"
                class="epay-image"
              />
</div>
       <h3 class="provider">${product.provider}</h3>     
<div class="epay-count">${product.count}</div>


            </div>

          `,
            )
            .join("")}

        </div>

      </section>

    `;
        })
        .join("");
    };

    const response = await axios.get(
      "https://testserver-iota.vercel.app/getDataV2",
    );

    const products = response.data;

    const sanitizeXMLDATA = sanitizeXML(products);

    const parser = new VanillaXMLParser();
    const xmlTree = parser.parseFromString(sanitizeXMLDATA);

    const catalogProducts = extractEpayProducts(xmlTree, req);

    const attachCurrencyData = await attachCurrency(catalogProducts);
    console.log("attachCurrencyData--", attachCurrencyData);
    const renderedProducts = renderCategoryWiseCatalog(attachCurrencyData);

    const html = `
      <html>

      <head>

        <title>Epay Products</title>

        <style>

.epay-card {
    width: 120px;
    position: relative;
    cursor: pointer;
    min-width: 120px;
}

   .epay-card .thumbnail-img {
    box-shadow: #00000040 0 0 10px;
    border-radius: 8px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 120px;
}

.epay-card .thumbnail-img img {
    width: 100px;
    height: 100px;
    object-fit: contain;
}

.epay-category-grid .epay-card:first-child:before {
    content: "";
    display: inline-block;
    width: 20px;
    height: 120px;
    left: -10px;
    top: 0;
    background-color: #f26b40;
    border-radius: 10px 0 0 10px;
    position: absolute;
    z-index: -1;
}
    .epay-category-grid .epay-card:last-child:after {
    content: "";
    display: inline-block;
    width: 20px;
    height: 120px;
    right: -10px;
    top: 0;
    background-color: #f26b40;
    border-radius: 0 10px 10px 0;
    position: absolute;
    z-index: -1;
}

 .epay-category-grid .epay-card .epay-count {
    position: absolute;
    align-self: flex-end;
    background-color: #f39200;
    border-radius: 10px;
    color: #fff;
    font-family: Roboto, Helvetica Neue, Helvetica, Arial, sans-serif;
    font-size: 10px;
    font-weight: 600;
    height: 20px;
    right: 0;
    top: 0;
    line-height: 20px;
    min-width: 20px;
    opacity: 1;
    padding-right: 4px;
    padding-left: 4px;
    vertical-align: middle;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
    .epay-card .provider{
    font-size: 14px;
    margin: 8px 0;
    text-align: center;
    color:#000;
    }    

        .epay-category {
  margin-bottom: 50px;
}

.category-title {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 16px;
}

.epay-category-grid {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    -ms-overflow-style: none;
    scrollbar-width: none;
    padding-left: 20px;
}


          body {
            font-family: Arial;
            background: #f5f5f5;
            margin: 0;
            padding: 30px;
            box-sizing:border-box;
          }
*{
     box-sizing:border-box;
}


        </style>

      </head>

      <body>

        <h1>Select a brand</h1>

      <div class="grid">

        ${renderedProducts}

      </div>
        <script>

        alert('hi page load');

        document.addEventListener("DOMContentLoaded", function() {
    // Runs as soon as the HTML is parsed, even if images are still loading
    console.log("DOM is fully loaded and parsed");
});
          async function buyNow(ean) {
          console.log('eanval--',)
            // Replace with real Shopify Variant ID
            const variantId = 123456789;

            await fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: 0731944723303,
                quantity: 1
              })
            });

            window.location.href = '/checkout';
          }

        </script>

      </body>

      </html>
    `;

    res.send(html);

    // <div class="grid">

    //   ${products.map(product => `

    //     <div class="card">

    //       <img src="${product.thumbnail}" />

    //       <h3>${product.title}</h3>

    //       <p>₹${product.price}</p>

    // <button
    //   onclick="buyNow('${product.EAN}')"
    // >
    //   Buy Now
    // </button>

    //     </div>

    //   `).join("")}

    // </div>
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Server Running");
});
