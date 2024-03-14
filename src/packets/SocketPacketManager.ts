import PacketEncoder from "./PacketEncoder";

import dgram from "dgram";
import { Bot } from "mineflayer";
import { log } from "../PlasmoVoice";
import Utils from "../Utils";
import PacketManager from "./PacketManager";
import PingPacket from "./socket/PingPacket";
import PlayerAudioPacket from "./socket/PlayerAudioPacket";
import SourceAudioPacket from "./socket/SourceAudioPacket";

export default class SocketPacketManager {
	private readonly bot;
	private readonly packetManager;
	private readonly packetEncoder;

	socketClient: dgram.Socket | undefined;
	private socketSecret: UUID | undefined;
	private host: string | undefined;
	private port: number | undefined;

	// Socket packets
	private pingPacket: PingPacket | undefined;
	private sourceAudioPacket: SourceAudioPacket | undefined;
	private playerAudioPacket: PlayerAudioPacket | undefined;

	//private readonly voiceLastTimestamp: number = 0;

	constructor(
		bot: Bot,
		packetEncoder: PacketEncoder,
		packetManager: PacketManager,
	) {
		this.bot = bot;
		this.packetManager = packetManager;
		this.packetEncoder = packetEncoder;

		this.socketClient = dgram.createSocket("udp4");

		this.socketClient.on("error", (err) => {
			log.fatal(new Error(`Failed to connect to UDP server: ${err}`));
			process.exit();
		});

		process.on("SIGINT", () => {
			try {
				if (this.socketClient) this.socketClient.close();
				this.socketClient = undefined;
			} catch {}
		});
	}

	private initializePackets() {
		const socket = {
			client: this.socketClient!,
			host: this.host!,
			port: this.port!,
		};

		if (this.pingPacket) this.pingPacket.cleanup();
		if (this.sourceAudioPacket) this.sourceAudioPacket.cleanup();
		if (this.playerAudioPacket) this.playerAudioPacket.cleanup();

		// Socket packets
		this.pingPacket = new PingPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!,
		);

		this.sourceAudioPacket = new SourceAudioPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!,
		);

		this.playerAudioPacket = new PlayerAudioPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!,
		);
	}

	private initializePacketEvents() {
		// receiving PingPacket => response with PingPacket
		this.pingPacket!.received(() => {
			this.pingPacket!.send({
				currentTime: BigInt(Date.now()),
			});
		});

		// receiving SourceAudioPacket => listening some source
		this.sourceAudioPacket!.received((data) => {
			if (
				this.packetManager.sourceById.some((item) =>
					Utils.objectEquals(item.sourceId, data.sourceId),
				)
			) {
				// Sound event
				const sourceData = this.packetManager.sourceById.find((item) =>
					Utils.objectEquals(item.sourceId, data.sourceId),
				);

				if (!sourceData) {
					return;
				}

				this.bot.emit("plasmovoice_voice", {
					player: sourceData.playerName,
					distance: data.distance,
					sequenceNumber: data.sequenceNumber,
					data: this.packetEncoder.decodePCM(
						this.packetEncoder.decryptOpus(data.data),
					),
				});
			} else {
				// Requesting source info
				this.packetManager.sourceInfoRequestPacket.send({
					sourceId: data.sourceId,
				});
			}

			return;
		});
	}

	async connect(host: string, port: number, socketSecret: UUID) {
		log.info(`Connecting to socket ${host}:${port}`);

		// Save data
		this.host = host;
		this.port = port;
		this.socketSecret = socketSecret;

		this.initializePackets();
		this.initializePacketEvents();

		this.pingPacket!.send({
			currentTime: BigInt(Date.now()),
		});
	}

	private lastPlayerAudioPacketTimestamp = 0;

	public stopFlag = false;

	isTalking() {
		return Date.now() - this.lastPlayerAudioPacketTimestamp < 15 * 1.5;
	}

	async stopTalking(): Promise<void> {
		if (!this.isTalking()) {
			return;
		}

		this.stopFlag = true;
		return await new Promise((resolve) =>
			this.bot.once("plasmovoice_audio_end", () => {
				this.stopFlag = false;
				resolve(undefined);
			}),
		);
	}

	async sendPCM(pcmBuffer: Buffer, distance: number, activation: string) {
		this.stopFlag = false;

		if (this.isTalking()) {
			log.error(new Error("Voice channel is busy"));
			return;
		}

		const frameSize =
			(this.packetManager.config!.captureInfo.sampleRate / 1_000) *
			20 *
			2;

		const activationUUID = Utils.getActivationUUID(activation);

		// Cut pcm to frames
		const frames = [];
		for (let i = 0; i < pcmBuffer.length; i += frameSize) {
			const frame = pcmBuffer.subarray(i, i + frameSize);
			frames.push(frame);
		}

		for (let i = 0; i < frames.length; i++) {
			// Stopping method
			if (this.stopFlag) {
				log.info("Voice interrupted");
				break;
			}

			const frame = frames[i];

			// Last frame (by default is empty or silent)
			if (frame.length !== frameSize) {
				break;
			}

			const opus = this.packetEncoder.encodePCM(frame);
			const ecryptedOpus = this.packetEncoder.encryptOpus(opus);

			// PlayerAudioPacket
			await this.playerAudioPacket!.send({
				sequenceNumber: BigInt(i),
				data: ecryptedOpus,
				activationId: activationUUID,
				distance: distance,
				stereo: false,
			});

			this.lastPlayerAudioPacketTimestamp = Date.now();

			await new Promise((r) => setTimeout(r, 10));
		}

		this.bot.emit("plasmovoice_audio_end");
	}
}