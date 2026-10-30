import type { Result } from "neverthrow";

export interface NetworkSerDeclare {
	/**
	 * Serialize the current object as a declaration.
	 */
	network_serialize_declare(): object;
}

export interface NetworkDeDeclare<Self> {
	/**
	 * Receive a declaration and create `Self` based on the declaration.
	 *
	 * Reading any data fields before `Self` had an update or was written to is undefined behavior
	 *
	 * @param data the incoming data
	 */
	network_deserialize_declare(data: object): Result<Self, string>;
}

export interface NetworkSerUpdate {
	/**
	 * Serialize this object's information for and update
	 */
	network_serialize_update(): object;
}

export interface NetworkDeUpdate {
	/**
	 * Deserialize the update and apply the update to this object.
	 * @param data the incoming data
	 */
	network_deserialize_update(data: object): Result<void, string>;
}
