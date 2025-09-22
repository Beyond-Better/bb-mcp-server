export const isError = (error: unknown): error is Error => {
	return error instanceof Error;
};

export const errorMessage = (error: unknown): string => {
	return isError(error) ? error.message : String(error);
};

export const errorName = (error: unknown): string => {
	return isError(error) ? error.name : String(error);
};

/**
 * Convert unknown value to Error, safely handling non-Error types
 */
export const toError = (value: unknown): Error => {
	if (isError(value)) {
		return value;
	}
	
	// Handle string messages
	if (typeof value === 'string') {
		return new Error(value);
	}
	
	// Handle objects with message property
	if (value && typeof value === 'object' && 'message' in value) {
		return new Error(String(value.message));
	}
	
	// Fallback for any other type
	return new Error(String(value));
};
