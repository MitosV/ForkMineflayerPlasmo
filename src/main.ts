import mineflayer from "mineflayer";
import plasmo from "./index";

class Bot {
	bot: mineflayer.Bot;
	constructor(name: string) {
		this.bot = mineflayer.createBot({
			host: "localhost",
			username: name,
			auth: "offline",
			port: 25565,
			version: "1.19.4",
		});

		this.initBot();
	}

	initBot() {
		this.bot.loadPlugin(plasmo.plugin);

		/** By default - 4, and these are warnings, errors and fatal errors */

		this.bot.on("plasmovoice_connected", () => {
			this.bot.setControlState("sneak", true);

			// Path to file with any audio format
			console.log("PLASMO CONNECTED");
			this.bot.plasmovoice.sendAudio(`./tomar_pastilla.ogg`);
		});

		this.bot.on("plasmovoice_audio_end", () => {
			this.bot.setControlState("sneak", false);
			this.bot.plasmovoice.sendAudio(`./tomar_pastilla.ogg`);
		});

		this.bot.on("kicked", console.log);
		this.bot.on("error", console.log);
	}
}

export function start() {
	new Bot(process.argv[2]);
}
