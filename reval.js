fs = require("fs");

const puppeteer = require("puppeteer");

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function agreeToDisclaimer(page) {
  await page.waitForSelector("#btAgree");
  await page.click("#btAgree");
  return page.waitForNavigation({ waitUntil: "domcontentloaded" });
}

(async () => {
  const parcels = await JSON.parse(fs.readFileSync("./parcels.json", "utf8"));

  const browser = await puppeteer.launch({
    // for some reason I do not understand this script fails when run in
    // headless mode
    headless: false,
    timeout: 3000,
    // slowMo: 200,
  });
  const page = await browser.newPage();

  await page.goto(
    "https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=parid",
    { waitUntil: "domcontentloaded", timeout: 2000 }
  );
  await agreeToDisclaimer(page);

  const histories = {};
  let n = 0;
  for (const parcel in parcels) {
    console.log(parcel);

    await page.goto(
      "https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=parid",
      { waitUntil: "domcontentloaded", timeout: 2000 }
    );

    await page.waitForSelector("#btSearch");

    // clear the input and type the parcel id
    await page.evaluate(() => (document.getElementById("inpParid").value = ""));
    await page.type("#inpParid", parcel);
    await page.click("#btSearch");
    await page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 2000,
    });

    if (
      page.url() ==
      "https://assessors.portlandmaine.gov/search/CommonSearch.aspx?mode=PARID"
    ) {
      console.log("error getting", parcel);
      histories[parcel[0]] = "error getting history";
      n += 1;
      sleep(500);
      continue;
    }

    // go to assessment history
    await page.waitForSelector(
      "#sidemenu > .navigation > .unsel:nth-child(8) > a > span"
    );
    await page.click(
      "#sidemenu > .navigation > .unsel:nth-child(8) > a > span"
    );

    // the stupid table has an id with a space in it
    await page.waitForSelector("[id='Assessment History'] tr");
    let rows = await page.$$eval("[id='Assessment History'] tr", (trs) =>
      trs.map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => td.innerText)
      )
    );

    histories[parcel] = rows;
    fs.writeFileSync("histories.json", JSON.stringify(histories));

    n += 1;
    sleep(500);
  }

  fs.writeFileSync("histories.json", JSON.stringify(histories));

  await browser.close();
})();
