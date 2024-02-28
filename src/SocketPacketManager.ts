import PacketEncoder from "./PacketEncoder";

import dgram from "dgram";
import PingPacket from "./packets/socket/PingPacket";
import SourceAudioPacket from "./packets/socket/SourceAudioPacket";
import PacketManager from "./PacketManager";
import Utils from "./utils";
import { Bot } from "mineflayer";
import { log } from "./PlasmoVoice";
import PlayerAudioPacket from "./packets/socket/PlayerAudioPacket";

export default class SocketPacketManager {
	private readonly bot;
	private readonly packetManager;
	private readonly packetEncoder;

	private socketClient: dgram.Socket | undefined;
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
		packetManager: PacketManager
	) {
		this.bot = bot;
		this.packetManager = packetManager;
		this.packetEncoder = packetEncoder;

		this.socketClient = dgram.createSocket("udp4");

		this.socketClient.on("error", (err) => {
			log.fatal(new Error(`Failed to connect to UDP server: ${err}`));
			process.exit();
		});
	}

	private initializePackets() {
		const socket = {
			client: this.socketClient!,
			host: this.host!,
			port: this.port!,
		};

		// Socket packets
		this.pingPacket = new PingPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!
		);

		this.sourceAudioPacket = new SourceAudioPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!
		);

		this.playerAudioPacket = new PlayerAudioPacket(
			socket,
			this.packetEncoder,
			this.socketSecret!
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
					Utils.objectEquals(item.sourceId, data.sourceId)
				)
			) {
				// Sound event
				const sourceData = this.packetManager.sourceById.find((item) =>
					Utils.objectEquals(item.sourceId, data.sourceId)
				);

				if (!sourceData) {
					return;
				}

				this.bot.emit("plasmovoice_voice", {
					player: sourceData.playerName,
					distance: data.distance,
					sequenceNumber: data.sequenceNumber,
					data: this.packetEncoder.decodePCM(
						this.packetEncoder.decryptPCM(data.data)
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
		log.info(
			`Connecting to socket ${host}:${port} with secret `,
			socketSecret
		);

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

	async sendPCM(pcmBuffer: Buffer, distance: number) {
		const frameSize =
			(this.packetManager.config!.captureInfo.sampleRate / 1_000) * 20;

		const activationUUID = Utils.getActivationUUID("proximity");

		// Cut pcm to frames
		const frames = [];
		for (let i = 0; i < pcmBuffer.length; i += frameSize) {
			const frame = pcmBuffer.slice(i, i + frameSize);
			frames.push(frame);
		}

		for (let i = 0; i < frames.length; i++) {
			const frame = frames[i];

			// Last frame (by default is empty or silent)
			if (frame.length !== frameSize) {
				break;
			}

			const opus = this.packetEncoder.encodePCM(frame);
			const ecryptedOpus = this.packetEncoder.encryptSound(opus);

			// PlayerAudioPacket
			await this.playerAudioPacket!.send({
				sequenceNumber: BigInt(i),
				data: ecryptedOpus,
				activationId: activationUUID,
				distance: distance,
				stereo: false,
			});

			await new Promise((r) => setTimeout(r, 3));
		}

		this.bot.emit("plasmovoice_audio_end");
	}
}