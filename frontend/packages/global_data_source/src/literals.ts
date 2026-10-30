/**
 * Modes a topic can be opened under
 */
export const TopicOpenMode = {
	Read: "R",
	ReadWrite: "RW",
	ReadWriteMany: "RWM",
} as const;
export type TopicOpenMode_t =
	(typeof TopicOpenMode)[keyof typeof TopicOpenMode];

/**
 * Available underlying data types;
 */
export const DataTypes = {
	F32: "F32",
	F64: "F64",
	I16: "I16",
	I32: "I32",
	I64: "I64",
	U16: "U16",
	U32: "U32",
	U64: "U64",
	Message: "Message",
	Enum: "Enum",
	Record: "Record", // basically structs
	Group: "Group", // basically arrays
	ADT: "ADT", // tagged unions
} as const;
export type DataTypes_t = (typeof DataTypes)[keyof typeof DataTypes];

export const NetworkStreamMessageType = {
	Declare: "D",
	Update: "U",
} as const;
export type NetworkStreamMessageType_t =
	(typeof NetworkStreamMessageType)[keyof typeof NetworkStreamMessageType];
