import fetch from "node-fetch";
import chalk from "chalk";
import Table from "cli-table3";

const API_URL = "https://fundflow-ticker-4o9d46v8c-silverfoxwalls-s-projects.vercel.app/api/ticker";

async function showDashboard() {
  console.clear();
  console.log(chalk.cyan.bold("📊 FUND FLOW DASHBOARD"));
  console.log(chalk.gray("Updating every 10 seconds...\n"));

  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    const data = json.data;

    const table = new Table({
      head: [
        chalk.white("Symbol"),
        chalk.white("Price"),
        chalk.white("% Change"),
        chalk.white("FundFlow ($)"),
      ],
      style: { head: [], border: [] },
      colWidths: [10, 15, 12, 18],
    });

    data.forEach((d) => {
      const changeColor = d.change > 0 ? chalk.green : chalk.red;
      const flowColor =
        d.fundFlow > 0 ? chalk.greenBright : chalk.redBright;

      table.push([
        chalk.yellow(d.symbol),
        chalk.white(d.price.toFixed(4)),
        changeColor(`${d.change.toFixed(2)}%`),
        flowColor(d.fundFlow.toFixed(2)),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    console.error(chalk.red("Error fetching data:"), err.message);
  }
}

showDashboard();
setInterval(showDashboard, 10000);
