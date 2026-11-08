import asyncio
import json
import logging
import signal

from aiokafka import AIOKafkaProducer
from sqlalchemy import select

from app.database import SessionLocal, engine
from app.expense_events import EXPENSE_CREATED_TOPIC
from app.kafka_config import kafka_config
from app.models import ExpenseOutbox

logger = logging.getLogger(__name__)


async def publish_one(producer: AIOKafkaProducer) -> bool:
    async with SessionLocal.begin() as session:
        event = await session.scalar(
            select(ExpenseOutbox)
            .order_by(
                ExpenseOutbox.created_at,
                ExpenseOutbox.event_id,
            )
            .limit(1)
            .with_for_update(skip_locked=True)
        )

        if event is None:
            return False

        event_id = event.event_id

        await asyncio.wait_for(
            producer.send_and_wait(
                EXPENSE_CREATED_TOPIC,
                key=str(event_id).encode("utf-8"),
                value=json.dumps(
                    event.payload,
                    separators=(",", ":"),
                ).encode("utf-8"),
            ),
            timeout=15,
        )

        # This deletion commits only after broker acknowledgement.
        await session.delete(event)

    logger.info(
        "expense_event_published event_id=%s",
        event_id,
    )
    return True


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()

    for shutdown_signal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(shutdown_signal, stop.set)

    producer = AIOKafkaProducer(
        **kafka_config(),
        acks="all",
        request_timeout_ms=10_000,
    )

    try:
        await asyncio.wait_for(producer.start(), timeout=15)

        logger.info("expense_outbox_relay_started")

        while not stop.is_set():
            published = await publish_one(producer)

            if not published:
                try:
                    await asyncio.wait_for(
                        stop.wait(),
                        timeout=1,
                    )
                except TimeoutError:
                    pass

    finally:
        try:
            await asyncio.wait_for(
                producer.stop(),
                timeout=10,
            )
        finally:
            await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    try:
        asyncio.run(main())
    except Exception as error:
        logger.error(
            "expense_outbox_relay_failed error_type=%s",
            type(error).__name__,
        )
        raise SystemExit(1) from None