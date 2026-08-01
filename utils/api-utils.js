class ApiError extends Error {
    constructor(type, message, status = 500) {
        super(message);
        this.type = type;
        this.status = status;
    }
}

const ErrorTypes = {
    AUTHENTICATION: 'authentication_error',
    VALIDATION: 'validation_error',
    API: 'api_error',
    RATE_LIMIT: 'rate_limit_error',
    SERVER: 'server_error'
};

function validateApiKey(apiKey, provider) {
    if (!apiKey) {
        throw new ApiError(
            ErrorTypes.AUTHENTICATION,
            `${provider} API key not configured. Please provide an API key in the settings.`,
            401
        );
    }
}

function handleApiError(error, provider) {
    console.error(`${provider} API error:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
    });

    // Handle specific error cases
    if (error instanceof ApiError) {
        return {
            type: 'error',
            error: {
                type: error.type,
                message: error.message
            }
        };
    }

    if (error.response?.status === 401) {
        return {
            type: 'error',
            error: {
                type: ErrorTypes.AUTHENTICATION,
                message: `Invalid ${provider} API key. Please check your API key in the settings.`
            }
        };
    }

    if (error.response?.status === 429) {
        return {
            type: 'error',
            error: {
                type: ErrorTypes.RATE_LIMIT,
                message: `${provider} API rate limit exceeded. Please try again later.`
            }
        };
    }

    // Generic error response
    return {
        type: 'error',
        error: {
            type: ErrorTypes.API,
            message: error.response?.data?.error?.message || error.message || `Failed to generate response from ${provider}`
        }
    };
}

function formatSuccessResponse(content) {
    return {
        type: 'final',
        markdown: content,
        html: content
    };
}

module.exports = {
    ApiError,
    ErrorTypes,
    validateApiKey,
    handleApiError,
    formatSuccessResponse
};
