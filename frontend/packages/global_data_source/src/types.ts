import { err, ok, safeTry, type Result } from "neverthrow";
import type {
	NetworkDeDeclare,
	NetworkDeUpdate,
	NetworkSerDeclare,
	NetworkSerUpdate,
} from "./network_serialize.ts";

/**
 * Any compatible RiverDash datatype
 */
export type Any =
	I16 | I32 | I64 | U16 | U32 | U64 | F32 | F64 | Enum | Group | ADT;

/**
 * Available underlying data types;
 */
export enum DataTypes {
	F32 = "F32",
	F64 = "F64",
	I16 = "I16",
	I32 = "I32",
	I64 = "I64",
	U16 = "U16",
	U32 = "U32",
	U64 = "U64",
	Enum = "Enum",
	Record = "Record", // basically structs
	Group = "Group", // basically arrays
	ADT = "ADT", // tagged unions
}

/**
 * Automatically deserialize any data declare coming from network.
 * 	Ok if `type` is valid and data was successfully parsed.
 * 	Err if `type` is invalid or data was not successfully parsed.
 *
 * @param type the type string, matching {@link DataTypes}
 * @param data the incoming data
 * @returns the type if okay, error string if not
 */
export function network_deserialize_any_declare(
	type: string,
	data: string,
): Result<Any, string> {
	switch (type as DataTypes) {
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
export enum NumericError {
	ErrNumberTooSmall,
	ErrNumberTooBig,
	ErrNotAnInteger,
	ErrNotFinite,
}

/**
 * A number with an upper and lower bound
 *
 * `Repr` can be either number or bigint
 */
export class NumberSized<Repr extends number | bigint>
	implements NetworkSerUpdate, NetworkSerDeclare
{
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
	 * @returns Ok if success, {@link NumericError} if n out of range
	 */
	public checked_set(n: Repr): Result<this, NumericError> {
		if (n > this.m_max) return err(NumericError.ErrNumberTooBig);
		if (n < this.m_min) return err(NumericError.ErrNumberTooSmall);
		this.m_n = n;

		return ok(this);
	}

	public network_serialize_declare(): string {
		return "";
	}
	public network_serialize_update(): string {
		return String(this.m_n);
	}
}

/**
 * A normal integer (not large or super small -- aka not any of the 64bit or above data types).
 * Implemented using `number`
 */
export class NumberNorInteger
	extends NumberSized<number>
	implements NetworkDeUpdate
{
	public override checked_set(n: number): Result<this, NumericError> {
		if (!Number.isSafeInteger(n)) return err(NumericError.ErrNotAnInteger);
		return super.checked_set(n);
	}

	public network_deserialize_update(data: string): Result<void, string> {
		return this.checked_set(Number(data)).mapErr((e) => e.toString()) as Result<
			unknown,
			string
		> as Result<void, string>;
	}
}

/**
 * A big integer, supporting infinite underlying range. Implemented using `bigint`
 */
export class NumberBigInteger
	extends NumberSized<bigint>
	implements NetworkDeUpdate
{
	public network_deserialize_update(data: string): Result<void, string> {
		let d;
		try {
			d = BigInt(data);
		} catch (error) {
			return err(String(error));
		}

		return this.checked_set(d).mapErr((e) => e.toString()) as Result<
			unknown,
			string
		> as Result<void, string>;
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
	implements NetworkDeUpdate
{
	public override checked_set(n: number): Result<this, NumericError> {
		if (!Number.isFinite(n)) return err(NumericError.ErrNotFinite);
		return super.checked_set(n);
	}

	public network_deserialize_update(data: string): Result<void, string> {
		return this.checked_set(Number(data)).mapErr((e) => e.toString()) as Result<
			unknown,
			string
		> as Result<void, string>;
	}
}

/**
 * 32bit signed integer
 */
export class I32 extends NumberNorInteger {
	public static readonly MAX: number = 2 ** 31 - 1;
	public static readonly MIN: number = -(2 ** 31);

	private constructor() {
		super(0, I32.MAX, I32.MIN);
	}

	public static from(n: number): Result<I32, NumericError> {
		return new I32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<I32, string> {
		return ok(new I32());
	}
}
I32 satisfies NetworkDeDeclare<I32>;

/**
 * 16bit signed integer
 */
export class I16 extends NumberNorInteger {
	public static readonly MAX: number = 2 ** 15 - 1;
	public static readonly MIN: number = -(2 ** 15);

	private constructor() {
		super(0, I16.MAX, I16.MIN);
	}

	public static from(n: number): Result<I16, NumericError> {
		return new I16().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<I16, string> {
		return ok(new I16());
	}
}
I16 satisfies NetworkDeDeclare<I16>;

/**
 * 64bit signed integer
 */
export class I64 extends NumberBigInteger {
	public static readonly MAX: bigint = 2n ** 63n - 1n;
	public static readonly MIN: bigint = -(2n ** 63n);

	private constructor() {
		super(0n, I64.MAX, I64.MIN);
	}

	public static from(n: bigint): Result<I64, NumericError> {
		return new I64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<I64, string> {
		return ok(new I64());
	}
}
I64 satisfies NetworkDeDeclare<I64>;

/**
 * 16bit unsigned integer
 */
export class U16 extends NumberNorInteger {
	public static readonly MAX: number = 2 ** 16 - 1;
	public static readonly MIN: number = 0;

	private constructor() {
		super(0, U16.MAX, U16.MIN);
	}

	public static from(n: number): Result<U16, NumericError> {
		return new U16().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<U16, string> {
		return ok(new U16());
	}
}
U16 satisfies NetworkDeDeclare<U16>;

/**
 * 32bit unsigned integer
 */
export class U32 extends NumberNorInteger {
	public static readonly MAX: number = 2 ** 32 - 1;
	public static readonly MIN: number = 0;

	private constructor() {
		super(0, U32.MAX, U32.MIN);
	}

	public static from(n: number): Result<U32, NumericError> {
		return new U32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<U32, string> {
		return ok(new U32());
	}
}
U32 satisfies NetworkDeDeclare<U32>;

/**
 * 64bit unsigned integer
 */
export class U64 extends NumberBigInteger {
	public static readonly MAX: bigint = 2n ** 64n - 1n;
	public static readonly MIN: bigint = 0n;

	private constructor() {
		super(0n, U64.MAX, U64.MIN);
	}

	public static from(n: bigint): Result<U64, NumericError> {
		return new U64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<U64, string> {
		return ok(new U64());
	}
}
U64 satisfies NetworkDeDeclare<U64>;

/**
 * 32bit IEEE 754 single precision decimal
 */
export class F32 extends NumberDecimal {
	public static readonly MAX: number = (2 - 2 ** -23) * 2 ** 127;
	public static readonly MIN: number = -(2 - 2 ** -23) * 2 ** 127;

	private constructor() {
		super(0, F32.MAX, F32.MIN);
	}

	public static from(n: number): Result<F32, NumericError> {
		return new F32().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<F32, string> {
		return ok(new F32());
	}
}
F32 satisfies NetworkDeDeclare<F32>;

/**
 * 64bit IEEE 754 single precision decimal.
 *
 * This is equivalent to `number`
 */
export class F64 extends NumberDecimal {
	// JS number is IEEE 754 binary64
	public static readonly MAX: number = Number.MAX_VALUE;
	public static readonly MIN: number = Number.MIN_VALUE;

	private constructor() {
		super(0, F64.MAX, F64.MIN);
	}

	public static from(n: number): Result<F64, NumericError> {
		return new F64().checked_set(n);
	}

	public static network_deserialize_declare(
		_data: string,
	): Result<F64, string> {
		return ok(new F64());
	}
}
F64 satisfies NetworkDeDeclare<F64>;

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
		value: T,
		type: TIdent,
	): TaggedUnion<T, TIdent> {
		const variant: TUVariant<T, TIdent> = {
			parent: this,
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

	public network_serialize_update(): string {
		if (this.m_active == undefined) return "";

		return String(this.m_active.discriminant);
	}
	public network_deserialize_update(data: string): Result<void, string> {
		if (data.length == 0) this.m_active = undefined;

		const d = Number(data);
		if (!Number.isSafeInteger(d))
			return err(`PARSE: Enum variant of ${d} is not an Integer\n`);
		return this.set_active(d) as Result<unknown, string> as Result<
			void,
			string
		>;
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
	/** This variant's type. If used as an enum, this'll be the same for all Variants */
	type: TIdent;
	/** The value of this variant */
	value: T;
}

/**
 * An Enum. This is a {@link TaggedUnion} of strings. With a type ident of "string": string.
 */
export class Enum
	extends TaggedUnion<string, string>
	implements NetworkSerDeclare
{
	public network_serialize_declare(): string {
		const variants_obj: [number, string][] = [];

		for (const v of this.m_variants.values()) {
			variants_obj.push([v.discriminant, v.value]);
		}

		return JSON.stringify(variants_obj);
	}

	public static network_deserialize_declare(
		data: string,
	): Result<Enum, string> {
		let variants_obj: unknown;

		try {
			variants_obj = JSON.parse(data);
		} catch (error) {
			return err(`PARSE: Invalid JSON: ${String(error)}\n`);
		}

		if (!Array.isArray(variants_obj))
			return err(
				`PARSE: Variants obj is not an array. obj: ${String(variants_obj)}`,
			);

		const new_e = new Enum();

		for (const v of variants_obj) {
			if (!Array.isArray(v))
				return err(`PARSE: Variant is not an array. v is ${v}\n`);
			if (v.length != 2)
				return err(`PARSE: Variant length is not 2. l is ${v.length}\n`);

			const dis = Number(v[0]);
			const val: unknown = v[1];
			if (!Number.isSafeInteger(dis))
				return err(`PARSE: Invalid discriminant: ${v[0]}\n`);
			if (typeof val !== "string")
				return err(`PARSE: Invalid value, not a string: ${v[1]}\n`);

			new_e.associate(dis, val, "string");
		}

		return ok(new_e);
	}
}
Enum satisfies NetworkDeDeclare<Enum>;

/**
 * An ADT or tagged union. This is a {@link TaggedUnion} of {@link Any} and type ident {@link DataTypes}
 */
export class ADT
	extends TaggedUnion<Any, DataTypes>
	implements NetworkSerDeclare
{
	public network_serialize_declare(): string {
		const variants_obj: [number, string, string][] = [];

		for (const v of this.m_variants.values()) {
			variants_obj.push([
				v.discriminant,
				v.type satisfies string,
				v.value.network_serialize_declare(),
			]);
		}

		return JSON.stringify(variants_obj);
	}

	public static network_deserialize_declare(data: string): Result<ADT, string> {
		return safeTry(function* () {
			let variants_obj: unknown;

			try {
				variants_obj = JSON.parse(data);
			} catch (error) {
				return err(`PARSE: Invalid JSON: ${String(error)}\n`);
			}

			if (!Array.isArray(variants_obj))
				return err(
					`PARSE: Variants obj is not an array. obj: ${String(variants_obj)}`,
				);

			const new_adt = new ADT();

			for (const v of variants_obj) {
				if (!Array.isArray(v))
					return err(`PARSE: Variant is not an array. v is ${v}\n`);
				if (v.length != 2)
					return err(`PARSE: Variant length is not 2. l is ${v.length}\n`);

				const dis = Number(v[0]);
				const type: unknown = v[1];
				const data: unknown = v[2];
				if (!Number.isSafeInteger(dis))
					return err(`PARSE: Invalid discriminant: ${v[0]}\n`);
				if (typeof type !== "string")
					return err(`PARSE: Invalid type, not a string: ${String(type)}\n`);
				if (typeof data !== "string")
					return err(`PARSE: Invalid data, not a string: ${String(data)}\n`);

				const value = yield* network_deserialize_any_declare(type, data);
				// type is guaranteed to be DataTypes at this point
				new_adt.associate(dis, value, type as DataTypes);
			}

			return ok(new_adt);
		});
	}

	public override network_serialize_update(): string {
		return JSON.stringify([
			super.network_serialize_update(),
			this.m_active == undefined
				? ""
				: this.m_active.value.network_serialize_update(),
		]);
	}

	public override network_deserialize_update(
		data: string,
	): Result<void, string> {
		const super_deserialize = super.network_deserialize_update.bind(this);
		return safeTry(
			function* (this: ADT) {
				let update_obj: unknown;
				try {
					update_obj = JSON.parse(data);
				} catch (error) {
					return err(`PARSE: Invalid JSON: ${String(error)}\n`);
				}

				if (!Array.isArray(update_obj))
					return err(`PARSE: Invalid update obj: ${String(update_obj)}\n`);
				if (update_obj.length !== 2)
					return err(`PARSE: Invalid update obj len: ${update_obj.length}\n`);

				const dis: unknown = update_obj[0];
				const val: unknown = update_obj[1];

				if (typeof dis !== "string")
					return err(
						`PARSE: Invalid discriminator, not a string: ${String(dis)}`,
					);
				if (typeof val !== "string")
					return err(`PARSE: Invalid value, not a string: ${String(val)}\n`);

				yield* super_deserialize(data);

				if (this.m_active != undefined) {
					yield* this.m_active.value.network_deserialize_update(data);
				}

				return ok();
			}.bind(this),
		);
	}
}
ADT satisfies NetworkDeDeclare<ADT>;

/**
 * A group of data types. This is a list of data types that is grouped together.
 * 	Similar to an array.
 *
 * All items of a group are {@link ValueNamed}.
 */
export class Group
	extends Array<ValueNamed<Any>>
	implements NetworkSerDeclare, NetworkSerUpdate, NetworkDeUpdate
{
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
	public add_value(value: Any, name: string, type: DataTypes): Group {
		this.push({ value, name, type });
		return this;
	}

	public network_serialize_declare(): string {
		const declare_obj = new Array<[string, string, string]>();

		for (const i of this) {
			declare_obj.push([i.name, i.type, i.value.network_serialize_declare()]);
		}

		return JSON.stringify(declare_obj);
	}
	public static network_deserialize_declare(
		data: string,
	): Result<Group, string> {
		return safeTry(function* () {
			let declare_obj: unknown;
			try {
				declare_obj = JSON.parse(data);
			} catch (error) {
				return err(`PARSE: Invalid JSON: ${String(error)}\n`);
			}

			if (!Array.isArray(declare_obj))
				return err(
					`PARSE: Invalid Group Decl, not an array: ${String(declare_obj)}`,
				);

			const new_group = new Group();

			for (const [name, type, value] of declare_obj) {
				if (typeof name !== "string")
					return err(`PARSE: Invalid Name, not a string: ${name}\n`);
				if (typeof type !== "string")
					return err(`PARSE: Invalid Type, not a string: ${type}\n`);
				if (typeof value !== "string")
					return err(`PARSE: Invalid Value, not a string: ${value}\n`);

				new_group.add_value(
					yield* network_deserialize_any_declare(type, value),
					name,
					type as DataTypes, // type must be valid at this point
				);
			}

			return ok(new_group);
		});
	}

	public network_serialize_update(): string {
		const update_obj = new Array<string>();

		for (const i of this) {
			update_obj.push(i.value.network_serialize_update());
		}

		return JSON.stringify(update_obj);
	}
	public network_deserialize_update(data: string): Result<void, string> {
		return safeTry(
			function* (this: Group) {
				let update_obj: unknown;
				try {
					update_obj = JSON.parse(data);
				} catch (error) {
					return err(`PARSE: Invalid JSON: ${String(error)}\n`);
				}

				if (!Array.isArray(update_obj))
					return err(
						`PARSE: Group Update is not an array: ${String(update_obj)}`,
					);
				if (update_obj.length !== self.length)
					return err(
						`PARSE: Group Update Obj length mismatch: ${update_obj.length}, ${self.length}`,
					);

				for (let i = 0; i < update_obj.length; i++) {
					const v: unknown = update_obj[i];
					if (typeof v !== "string")
						return err(`PARSE: Group Update Value is not string: ${i}\n`);

					const value = this[i]?.value;
					if (value == undefined)
						throw new Error("Unreachable - Group - network_deserialize_update");
					yield* value.network_deserialize_update(v);
				}

				return ok();
			}.bind(this),
		);
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
	type: DataTypes;
}

/**
 * A record is a group with a special sense of self
 */
export class Record extends Group {}
