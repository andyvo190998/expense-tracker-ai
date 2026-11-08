import os
import ssl

def kafka_config() -> dict[str, object]:
	brokers = os.environ["KAFKA_BOOTSTRAP_SERVERS"]


	if os.getenv("KAFKA_ALLOW_LOCAL_PLAINTEXT") == "true":
		if os.getenv("APP_ENV") not in {"development", "test"}:
			raise RuntimeError(
				"Plaintext kafka is development-only"
			)

		return {
			"bootstrap_servers": brokers,
			"security_protocol": "PLAINTEXT"
		}

	mechanism = os.getenv(
		"KAFKA_SASL_MECHANISM",
		"SCRAM-SHA-512"
	).upper()

	if mechanism not in {"SCRAM-SHA-256", "SCRAM-SHA-512"}:
		raise RuntimeError("Unsupported Kafka SASL mechanism")

	return {
        "bootstrap_servers": brokers,
        "security_protocol": "SASL_SSL",
        "ssl_context": ssl.create_default_context(),
        "sasl_mechanism": mechanism,
        "sasl_plain_username": os.environ["KAFKA_USERNAME"],
        "sasl_plain_password": os.environ["KAFKA_PASSWORD"],
    }