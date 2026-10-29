import { Result, err, ok } from "neverthrow";
import * as zod from "zod";
import {
	DataTypes,
	TopicOpenMode,
	NetworkStreamMessageType,
} from "./literals.ts";

export function zod_parse<S extends zod.ZodType>(
	schema: S,
	value: unknown,
): Result<zod.infer<S>, string> {
	const r = zod.safeParse(schema, value);
	if (r.error) {
		return err(zod.prettifyError(r.error));
	}

	return ok(r.data);
}

export function zod_encode<S extends zod.ZodType, T extends zod.infer<S>>(
	schema: S,
	value: T,
): object {
	// This should never throw as the type defs here guarantee that value
	//  matches schema. It is assumed to be caller's responsibility to make
	//  sure value if valid for what is being encoded
	return zod.encode(schema, value) as object;
}

const stringToBigInt = zod.codec(zod.string(), zod.bigint(), {
	decode: (s, ctx) => {
		try {
			return BigInt(s);
		} catch (error: unknown) {
			ctx.issues.push({
				code: "invalid_format",
				format: "bigint",
				input: s,
				message: String(error),
			});
			return zod.NEVER;
		}
	},
	encode: (b) => String(b),
});

const bigintToTemporal = zod.codec(
	stringToBigInt,
	zod.instanceof(Temporal.Instant),
	{
		decode: (b, ctx) => {
			try {
				return Temporal.Instant.fromEpochNanoseconds(b);
			} catch (error: unknown) {
				ctx.issues.push({
					code: "invalid_format",
					format: "time_ns",
					input: String(b),
					message: String(error),
				});

				return zod.NEVER;
			}
		},
		encode: (t) => t.epochNanoseconds,
	},
);

export const NumberSized_ds = zod.object({});
export type NumberSized_dt = zod.infer<typeof NumberSized_ds>;

export const NumberNorInteger_us = zod.object({
	int: zod.number(),
});
export type NumberNorInteger_ut = zod.infer<typeof NumberNorInteger_us>;

export const NumberBigInteger_us = zod.object({
	big: stringToBigInt,
});
export type NumberBigInteger_ut = zod.infer<typeof NumberBigInteger_us>;

export const NumberDecimal_us = zod.object({
	decimal: zod.number(),
});
export type NumberDecimal_ut = zod.infer<typeof NumberDecimal_us>;

export const Message_ds = zod.object({});
export type Message_dt = zod.infer<typeof Message_ds>;

export const Message_us = zod.object({
	str: zod.string(),
});
export type Message_ut = zod.infer<typeof Message_us>;

export const TaggedUnion_us = zod.object({
	variant: zod.optional(zod.number()),
});
export type TaggedUnion_ut = zod.infer<typeof TaggedUnion_us>;

export const Enum_ds = zod.object({
	variants: zod.map(zod.number(), zod.string()),
});
export type Enum_dt = zod.infer<typeof Enum_ds>;

export const ADT_ds = zod.object({
	variants: zod.map(
		zod.number(),
		zod.object({
			name: zod.string(),
			type: zod.enum(DataTypes),
			value: zod.unknown(),
		}),
	),
});
export type ADT_dt = zod.infer<typeof ADT_ds>;

export const ADT_us = TaggedUnion_us.safeExtend({
	value: zod.optional(zod.unknown()),
});
export type ADT_ut = zod.infer<typeof ADT_us>;

export const Group_ds = zod.array(
	zod.object({
		name: zod.string(),
		type: zod.enum(DataTypes),
		value: zod.unknown(),
	}),
);
export type Group_d = zod.infer<typeof Group_ds>;

export const Group_us = zod.array(zod.unknown());
export type Group_ut = zod.infer<typeof Group_us>;

export const Topic_us = zod.union([
	zod.object({
		data: zod.unknown(),
		ts: bigintToTemporal,
	}),
	zod.object({}),
]);
export type Topic_ut = zod.infer<typeof Topic_us>;

export const Topic_ds = zod.object({
	name: zod.string(),
	mode: zod.enum(TopicOpenMode),
	type: zod.enum(DataTypes),
	declaration: zod.unknown(),
});
export type Topic_dt = zod.infer<typeof Topic_ds>;

export const NetworkStreamMessage_s = zod.object({
	name: zod.string(),
	type: zod.enum(NetworkStreamMessageType),
	data: zod.unknown(),
});
export type NetworkStreamMessage_st = zod.infer<typeof NetworkStreamMessage_s>;
