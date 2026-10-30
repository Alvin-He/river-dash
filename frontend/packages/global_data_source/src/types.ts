import { err, ok, type Result } from "neverthrow";
import type {
	NetworkDeDeclare,
	NetworkDeUpdate,
	NetworkSerDeclare,
	NetworkSerUpdate,
} from "./network_serialize.ts";
import {
	NumberNorInteger_us,
	type Message_dt,
	type NumberNorInteger_ut,
	type NumberBigInteger_ut,
	NumberBigInteger_us,
	NumberDecimal_us,
	type NumberDecimal_ut,
	Message_us,
	type TaggedUnion_ut,
	TaggedUnion_us,
	type ADT_dt,
	ADT_ds,
	type Enum_dt,
	Enum_ds,
	type ADT_ut,
	ADT_us,
	type Group_ut,
	Group_us,
	type Group_d,
	Group_ds,
	zod_parse,
	zod_encode,
} from "./network_schema.ts";
import { type DataTypes_t, DataTypes } from "./literals.ts";

/**
 * Any compatible RiverDash datatype
 */
export type Any =
	| I16
	| I32
	| I64
	| U16
	| U32
	| U64
	| F32
	| F64
	| Message
	| Enum
	| Group
	| Record
	| ADT;

// Re export literals
export { type DataTypes_t, DataTypes } from "./literals.ts";

/**
 * Automatically deserialize any data declare coming from network.
 * 	Ok if `type` is valid and data was successfully parsed.
 * 	Err if `type` is invalid or data was not successfully parsed.
 *
 * @param type the type string, matching {@link DataTypes_t}
 * @param data the incoming data
 * @returns the type if okay, error string if not
 */
export function network_deserialize_any_declare(
	type: string,
	data: object,
): Result<Any, string> {
	switch (type as DataTypes_t) {
		case DataTypes.F32:
			return F32.network_deserialize_declare(data);
		case DataTypes.F64:
			return F64.network_deserialize_declare(data);
		case DataTypes.I16:
			return I16.network_deserialize_declare(data);
		case DataTypes.I32:
			return I32.network_deserialize_declare(data);
		case DataTypes.I64:
			return I64.network_deserialize_declare(data);
		case DataTypes.U16:
			return U16.network_deserialize_declare(data);
		case DataTypes.U32:
			return U32.network_deserialize_declare(data);
		case DataTypes.U64:
			return U64.network_deserialize_declare(data);
		case DataTypes.Message:
			return Message.network_deserialize_declare(data);
		case DataTypes.Enum:
			return Enum.network_deserialize_declare(data);
		case DataTypes.ADT:
			return ADT.network_deserialize_declare(data);
		case DataTypes.Group:
			return Group.network_deserialize_declare(data);
		default:
			return err(`PARSE: Unknown type: ${type}\n`);
	}
}

/**
 * Errors thrown by numeric types
 */
export const NumericError = {
	ErrNumberTooSmall: "Number is too small",
	ErrNumberTooBig: "Number is too big",
	ErrNotAnInteger: "Not an integer",
	ErrNotFinite: "Not a finite number",
} as const;

export type NumericError_t = (typeof NumericError)[keyof typeof NumericError];

/**
 * A number with an upper and lower bound
 *
 * `Repr` can be either number or bigint
 */
export class NumberSized<
	Repr extends number | bigint,
> implements NetworkSerDeclare {
	declare private m_n: Repr;
	declare protected readonly m_max: Repr;
	declare protected readonly m_min: Repr;
	protected constructor(init: Repr, max: Repr, min: Repr) {
		this.m_n = init;
		this.m_max = max;
		this.m_min = min;
	}

	/**
	 * gets the raw value stored within this number
	 * @returns the raw value
	 */
	public get(): Repr {
		return this.m_n;
	}

	/**
	 * Sets the value of this number while also checking size
	 *
	 * @param n the value to set to
	 * @returns Ok if success, {@link NumericError_t} if n out of range
	 */
	public checked_set(n: Repr): Result<this, NumericError_t> {
		if (n > this.m_max) return err(NumericError.ErrNumberTooBig);
		if (n < this.m_min) return err(NumericError.ErrNumberTooSmall);
		this.m_n = n;

		return ok(this);
	}

	public network_serialize_declare(): object {
		return {} satisfies Message_dt;
	}
}

/**
 * A normal integer (not large or super small -- aka not any of the 64bit or above data types).
 * Implemented using `number`
 */
export class NumberNorInteger
	extends NumberSized<number>
	implements NetworkDeUpdate, NetworkSerUpdate
{
	public override checked_set(n: number): Result<this, NumericError_t> {
		if (!Number.isSafeInteger(n)) return err(NumericError.ErrNotAnInteger);
		return super.checked_set(n);
	}

	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(NumberNorInteger_us, data).andThen((v) =>
			this.checked_set(v.int).mapErr((e) => String(e)),
		) as Result<unknown, string> as Result<void, string>;
	}

	public network_serialize_update(): object {
		return {
			int: this.get(),
		} satisfies NumberNorInteger_ut;
	}
}

/**
 * A big integer, supporting infinite underlying range. Implemented using `bigint`
 */
export class NumberBigInteger
	extends NumberSized<bigint>
	implements NetworkDeUpdate, NetworkSerUpdate
{
	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(NumberBigInteger_us, data).andThen((v) =>
			this.checked_set(v.big).mapErr((e) => String(e)),
		) as Result<unknown, string> as Result<void, string>;
	}

	public network_serialize_update(): object {
		return zod_encode(NumberBigInteger_us, {
			big: this.get(),
		} satisfies NumberBigInteger_ut);
	}
}

/**
 * Type describing an integer
 */
export type NumberInteger = NumberNorInteger | NumberBigInteger;

/**
 * A decimal number, implemented using `number`
 */
export class NumberDecimal
	extends NumberSized<number>
	implements NetworkDeUpdate, NetworkSerUpdate
{
	public override checked_set(n: number): Result<this, NumericError_t> {
		if (!Number.isFinite(n)) return err(NumericError.ErrNotFinite);
		return super.checked_set(n);
	}

	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(NumberDecimal_us, data).andThen((v) =>
			this.checked_set(v.decimal).mapErr((e) => String(e)),
		) as Result<unknown, string> as Result<void, string>;
	}

	public network_serialize_update(): object {
		return {
			decimal: this.get(),
		} satisfies NumberDecimal_ut;
	}
}

/**
 * 32bit signed integer
 *
 * To create, call:
 * ```
 * let i32 = I32.from(number);
 * ```
 */
export class I32 extends NumberNorInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.I32;
	public static readonly MAX: number = 2 ** 31 - 1;
	public static readonly MIN: number = -(2 ** 31);

	private constructor() {
		super(0, I32.MAX, I32.MIN);
	}

	/**
	 * Create an I32 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<I32, NumericError_t> {
		return new I32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<I32, string> {
		return ok(new I32());
	}
}
I32 satisfies NetworkDeDeclare<I32>;

/**
 * 16bit signed integer
 *
 * To create, call:
 * ```
 * let i16 = I16.from(number);
 * ```
 */
export class I16 extends NumberNorInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.I16;
	public static readonly MAX: number = 2 ** 15 - 1;
	public static readonly MIN: number = -(2 ** 15);

	private constructor() {
		super(0, I16.MAX, I16.MIN);
	}

	/**
	 * Create an I16 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<I16, NumericError_t> {
		return new I16().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<I16, string> {
		return ok(new I16());
	}
}
I16 satisfies NetworkDeDeclare<I16>;

/**
 * 64bit signed integer
 *
 * To create, call:
 * ```
 * let i64 = I64.from(bigint);
 * ```
 */
export class I64 extends NumberBigInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.I64;
	public static readonly MAX: bigint = 2n ** 63n - 1n;
	public static readonly MIN: bigint = -(2n ** 63n);

	private constructor() {
		super(0n, I64.MAX, I64.MIN);
	}

	/**
	 * Create an I64 from a bigint
	 *
	 * @param n the bigint
	 * @returns ok if bigint fits within range, NumericError if not
	 */
	public static from(n: bigint): Result<I64, NumericError_t> {
		return new I64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<I64, string> {
		return ok(new I64());
	}
}
I64 satisfies NetworkDeDeclare<I64>;

/**
 * 16bit unsigned integer
 *
 * To create, call:
 * ```
 * let u16 = U16.from(number);
 * ```
 */
export class U16 extends NumberNorInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.U16;
	public static readonly MAX: number = 2 ** 16 - 1;
	public static readonly MIN: number = 0;

	private constructor() {
		super(0, U16.MAX, U16.MIN);
	}

	/**
	 * Create an U16 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<U16, NumericError_t> {
		return new U16().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<U16, string> {
		return ok(new U16());
	}
}
U16 satisfies NetworkDeDeclare<U16>;

/**
 * 32bit unsigned integer
 *
 * To create, call:
 * ```
 * let u32 = U32.from(number);
 * ```
 */
export class U32 extends NumberNorInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.U32;
	public static readonly MAX: number = 2 ** 32 - 1;
	public static readonly MIN: number = 0;

	private constructor() {
		super(0, U32.MAX, U32.MIN);
	}

	/**
	 * Create an U32 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<U32, NumericError_t> {
		return new U32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<U32, string> {
		return ok(new U32());
	}
}
U32 satisfies NetworkDeDeclare<U32>;

/**
 * 64bit unsigned integer
 *
 * To create, call:
 * ```
 * let u64 = U64.from(bigint);
 * ```
 */
export class U64 extends NumberBigInteger {
	public static readonly TYPE: DataTypes_t = DataTypes.U64;
	public static readonly MAX: bigint = 2n ** 64n - 1n;
	public static readonly MIN: bigint = 0n;

	private constructor() {
		super(0n, U64.MAX, U64.MIN);
	}

	/**
	 * Create an U64 from a bigint
	 *
	 * @param n the bigint
	 * @returns ok if the bigint fits within range, NumericError if not
	 */
	public static from(n: bigint): Result<U64, NumericError_t> {
		return new U64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<U64, string> {
		return ok(new U64());
	}
}
U64 satisfies NetworkDeDeclare<U64>;

/**
 * 32bit IEEE 754 single precision decimal
 *
 * To create, call:
 * ```
 * let f32 = F32.from(number);
 * ```
 */
export class F32 extends NumberDecimal {
	public static readonly TYPE: DataTypes_t = DataTypes.F32;
	public static readonly MAX: number = (2 - 2 ** -23) * 2 ** 127;
	public static readonly MIN: number = -(2 - 2 ** -23) * 2 ** 127;

	private constructor() {
		super(0, F32.MAX, F32.MIN);
	}

	/**
	 * Create an F32 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<F32, NumericError_t> {
		return new F32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<F32, string> {
		return ok(new F32());
	}
}
F32 satisfies NetworkDeDeclare<F32>;

/**
 * 64bit IEEE 754 single precision decimal.
 *
 * This is equivalent to `number`
 *
 * To create, call:
 * ```
 * let f64 = F64.from(number);
 * ```
 */
export class F64 extends NumberDecimal {
	public static readonly TYPE: DataTypes_t = DataTypes.F64;
	// JS number is IEEE 754 binary64
	public static readonly MAX: number = Number.MAX_VALUE;
	public static readonly MIN: number = Number.MIN_VALUE;

	private constructor() {
		super(0, F64.MAX, F64.MIN);
	}

	/**
	 * Create an F64 from a number
	 *
	 * @param n the number
	 * @returns ok if number fits within range, NumericError if not
	 */
	public static from(n: number): Result<F64, NumericError_t> {
		return new F64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<F64, string> {
		return ok(new F64());
	}
}
F64 satisfies NetworkDeDeclare<F64>;

/**
 * A String Message. This can be used to represent any textual data or JSON.
 *
 * If you do use a Message to represent you own data, you must perform your
 * own data validation. This class does not provide any validation except that
 * you get a string.
 *
 * To create, call:
 * ```
 * let msg = new Message("Hello World");
 * ```
 * or
 * ```
 * let empty_msg = new Message();
 * ```
 */
export class Message
	implements NetworkSerUpdate, NetworkDeUpdate, NetworkSerDeclare
{
	public static readonly TYPE: DataTypes_t = DataTypes.Message;

	declare private m_value: string;

	/**
	 * Create a Message.
	 */
	public constructor();
	/**
	 * Create a Message with an initial string
	 * @param value the initial value
	 */
	public constructor(value: string);
	public constructor(value?: string) {
		this.m_value = value ?? "";
	}

	/**
	 * Gets the current data
	 *
	 * @returns the current string
	 */
	public get(): string {
		return this.m_value;
	}

	/**
	 * Sets the underlying data
	 *
	 * @param value the new value
	 */
	public set(value: string) {
		this.m_value = value;
	}

	public network_serialize_update(): object {
		return { str: this.get() };
	}
	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(Message_us, data).map((v) => {
			this.set(v.str);
		});
	}
	public network_serialize_declare(): object {
		return {} satisfies Message_dt;
	}

	public static network_deserialize_declare(
		_data: object,
	): Result<Message, string> {
		return ok(new Message());
	}
}
Message satisfies NetworkDeDeclare<Message>;

/**
 * An TaggedUnion. (aka ADT)
 */
export class TaggedUnion<T, TIdent>
	implements NetworkSerUpdate, NetworkDeUpdate
{
	declare protected m_variants: Map<number, TUVariant<T, TIdent>>;
	declare protected m_active: TUVariant<T, TIdent> | undefined;

	/**
	 * Create a new tagged union
	 */
	public constructor() {
		this.m_variants = new Map();
		this.m_active = undefined;
	}

	/**
	 * Associate a discriminant to a value
	 *
	 * @param discriminant discriminant of value
	 * @param value value to associate to
	 * @param type the type for this value
	 * @returns `this` TaggedUnion for method chaining
	 */
	public associate(
		discriminant: number,
		name: string,
		value: T,
		type: TIdent,
	): TaggedUnion<T, TIdent> {
		const variant: TUVariant<T, TIdent> = {
			parent: this,
			name,
			discriminant,
			type,
			value,
		};

		this.m_variants.set(discriminant, variant);

		return this;
	}

	/**
	 * Sets the current active variant
	 *
	 * @param discriminant the active discriminant
	 * @returns Ok(void) if nothing, Err if discriminant do not exist
	 */
	public set_active(discriminant: number): Result<null, string>;
	/**
	 * Sets the current active variant
	 *
	 * @param variant the active variant
	 * @returns Ok(void) if nothing, Err if variant do not exist
	 */
	public set_active(variant: TUVariant<T, TIdent>): Result<null, string>;
	public set_active(ident: number | TUVariant<T, TIdent>): Result<null, string>;
	public set_active(
		ident: number | TUVariant<T, TIdent>,
	): Result<null, string> {
		let variant: TUVariant<T, TIdent>;
		if (typeof ident === "number") {
			const r = this.get_variant(ident);
			if (r == undefined) return err("ASSERT: Bad Variant!\n");
			variant = r;
		} else {
			if (ident.parent !== this) return err("ASSERT: Bad Variant!\n");
			variant = ident;
		}

		this.m_active = variant;
		return ok(null);
	}

	/**
	 * gets the current active variant
	 *
	 * @returns the active variant
	 */
	public get_active(): TUVariant<T, TIdent> | undefined {
		return this.m_active;
	}

	/**
	 * Find a variant associated with a discriminant
	 *
	 * @param discriminant the discriminant to look up
	 * @returns the variant or undefined if not found
	 */
	public get_variant(discriminant: number): TUVariant<T, TIdent> | undefined {
		return this.m_variants.get(discriminant);
	}

	public network_serialize_update(): object {
		if (this.m_active == undefined) return {} satisfies TaggedUnion_ut;

		return { variant: this.m_active.discriminant } satisfies TaggedUnion_ut;
	}
	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(TaggedUnion_us, data).andThen((v) => {
			if (v.variant) {
				return this.set_active(v.variant) as Result<unknown, string> as Result<
					void,
					string
				>;
			} else {
				this.m_active = undefined;
				return ok();
			}
		});
	}
}

/**
 * A TaggedUnion Variant
 */
export interface TUVariant<T, TIdent> {
	/** The TaggedUnion this Variant is under */
	parent: TaggedUnion<T, TIdent>;
	/** This variant's discriminant */
	discriminant: number;
	/** This variant's name */
	name: string;
	/** This variant's type. If used as an enum, this'll be the same for all Variants */
	type: TIdent;
	/** The value of this variant */
	value: T;
}

/**
 * An Enum. This is a {@link TaggedUnion} of nothing (void, void).
 * It associates a discriminant with an name.
 *
 * Usage:
 * ```js
 *	let enum = new Enum()
 *		.associate(0, "hello world")
 *		.associate(1, "variant 1")
 *	;
 *  enum.set_active(1);
 * ```
 */
export class Enum extends TaggedUnion<void, void> implements NetworkSerDeclare {
	public static readonly TYPE: DataTypes_t = DataTypes.Enum;
	public network_serialize_declare(): object {
		const enum_dec: Enum_dt = {
			variants: new Map(),
		};

		for (const v of this.m_variants.values()) {
			enum_dec.variants.set(v.discriminant, v.name);
		}

		return enum_dec;
	}

	public static network_deserialize_declare(
		data: object,
	): Result<Enum, string> {
		return zod_parse(Enum_ds, data).map((v) => {
			const new_e = new Enum();

			for (const [d, n] of v.variants.entries()) {
				new_e.associate(d, n);
			}

			return new_e;
		});
	}
}
Enum satisfies NetworkDeDeclare<Enum>;

/**
 * An ADT or tagged union. This is a {@link TaggedUnion} of {@link Any} and type ident {@link DataTypes_t}
 *
 * Usage:
 * ```js
 *	let adt = new ADT()
 *		.associate(0, "Group A Average", F32.from(0.1), F32.TYPE)
 *		.associate(1, "Group A", new Group()
 *			.add_value(F32.from(0.0), "Sensor 1", F32.TYPE)
 *			.add_value(F32.from(0.1), "Sensor 2", F32.TYPE)
 *			.add_value(F32.from(0.2), "Sensor 3", F32.TYPE),
 *		Group.TYPE
 *	);
 *	adt.set_active(1);
 * ```
 */
export class ADT
	extends TaggedUnion<Any, DataTypes_t>
	implements NetworkSerDeclare
{
	public static readonly TYPE: DataTypes_t = DataTypes.ADT;

	public network_serialize_declare(): object {
		const adt_dec: ADT_dt = {
			variants: new Map(),
		};

		for (const v of this.m_variants.values()) {
			adt_dec.variants.set(v.discriminant, {
				name: v.name,
				type: v.type,
				value: v.value.network_serialize_declare(),
			});
		}

		return adt_dec;
	}

	public static network_deserialize_declare(data: object): Result<ADT, string> {
		return zod_parse(ADT_ds, data).andThen((v) => {
			const new_adt = new ADT();

			for (const [d, e] of v.variants) {
				const inner_raw = network_deserialize_any_declare(
					e.type,
					e.value as object,
				);
				if (inner_raw.isErr()) return err(inner_raw._unsafeUnwrapErr());

				new_adt.associate(d, e.name, inner_raw._unsafeUnwrap(), e.type);
			}

			return ok(new_adt);
		});
	}

	public override network_serialize_update(): object {
		return {
			...super.network_serialize_update(),
			value: this.m_active?.value.network_serialize_update(),
		} satisfies ADT_ut;
	}

	public override network_deserialize_update(
		data: object,
	): Result<void, string> {
		return zod_parse(ADT_us, data)
			.andThrough((t) => super.network_deserialize_update(t))
			.andThen((t) => {
				if (t.value && this.m_active)
					return this.m_active.value.network_deserialize_update(t.value);
				else return ok();
			});
	}
}
ADT satisfies NetworkDeDeclare<ADT>;

/**
 * A group of data types. This is a list of data types that is grouped together.
 * 	Similar to an array.
 *
 * All items of a group are {@link ValueNamed}.
 *
 * Usage:
 * ```js
 * new Group()
 *		.add_value(F32.from(0.0), "Sensor 1", F32.TYPE)
 *		.add_value(F32.from(0.1), "Sensor 2", F32.TYPE)
 *		.add_value(F32.from(0.2), "Sensor 3", F32.TYPE)
 * ;
 * ```
 */
export class Group
	extends Array<ValueNamed<Any>>
	implements NetworkSerDeclare, NetworkSerUpdate, NetworkDeUpdate
{
	public static readonly TYPE: DataTypes_t = DataTypes.Group;

	/**
	 * Create a new Group
	 */
	public constructor() {
		super();
	}

	/**
	 * Sets all values of this group
	 *
	 * @param raw_data the raw array of values
	 * @returns Ok if success, Err if length mismatch or nullish values exists
	 */
	public set_values(raw_data: Any[]): Result<null, string> {
		if (raw_data.length != this.length)
			return err(
				`ASSERT: Data length does not match ${raw_data.length}, ${this.length}`,
			);

		for (let i = 0; i < this.length; i++) {
			const v = this[i];
			const r = raw_data[i];
			if (v == undefined || r == undefined)
				return err(`ASSERT: Value is Undefined while existing in array\n`);
			v.value = r;
		}

		return ok(null);
	}

	/**
	 * Adds a new value to the group
	 *
	 * @param value the value
	 * @param name the name
	 * @param type the type of value
	 * @returns `this` for method chaining
	 */
	public add_value(value: Any, name: string, type: DataTypes_t): Group {
		this.push({ value, name, type });
		return this;
	}

	public network_serialize_declare(): object {
		const group_d: Group_d = [];

		for (const i of this) {
			group_d.push({
				name: i.name,
				type: i.type,
				value: i.value.network_serialize_declare(),
			});
		}

		return group_d;
	}

	public static network_deserialize_declare(
		data: object,
	): Result<Group, string> {
		return zod_parse(Group_ds, data).andThen((v) => {
			const new_group = new Group();

			for (const i of v) {
				const r = network_deserialize_any_declare(
					i.type,
					i.value as object,
				).andTee((v) => new_group.add_value(v, i.name, i.type));

				if (r.isErr()) return r as Result<Group, string>;
			}

			return ok(new_group);
		});
	}

	public network_serialize_update(): object {
		const update_obj: Group_ut = [];

		for (const i of this) {
			update_obj.push(i.value.network_serialize_update());
		}

		return update_obj;
	}

	public network_deserialize_update(data: object): Result<void, string> {
		return zod_parse(Group_us, data).andThen((v) => {
			if (this.length !== v.length)
				return err(
					`PARSE: Group Update Arr length mismatch: ${this.length}, ${v.length}`,
				);

			for (let i = 0; i < this.length; i++) {
				const r = this[i]?.value.network_deserialize_update(
					(v[i] as object) ?? new Object(), // new object should be unreachable
				);

				if (r === undefined)
					return err(
						"Unreachable has been reached -- types.ts/network_deserialize_update",
					);
				if (r.isErr()) return err(r.error);
			}

			return ok();
		});
	}
}
Group satisfies NetworkDeDeclare<Group>;

/**
 * A Value that exists in a {@link Group}
 */
export interface ValueNamed<Data extends Any> {
	/** The value */
	value: Data;
	/** The name of this value */
	name: string;
	/** the type of this value */
	type: DataTypes_t;
}

/**
 * A record is a group with a special sense of self
 *
 * Usage:
 * ```js
 * new Record()
 *		.add_value(F32.from(10.3), "X", F32.TYPE)
 *		.add_value(F32.from(23.1), "Y", F32.TYPE)
 *		.add_value(F32.from(99.2), "Z", F32.TYPE)
 * ;
 * ```
 */
export class Record extends Group {
	public static override readonly TYPE: DataTypes_t = DataTypes.Record;
}
