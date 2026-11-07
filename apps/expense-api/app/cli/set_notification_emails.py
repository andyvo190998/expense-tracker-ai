import argparse
import asyncio
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.database import SessionLocal, engine
from app.models import User

class RecipientSettings(BaseModel):
	emails: list[EmailStr] = Field(max_length=5)

	@field_validator("emails")
	@classmethod
	def duplicate(cls, values:list[EmailStr]) -> list[str]:
		addresses: dict[str, str] = {}

		for value in values:
			address = str(value)
			addresses.setdefault(address.casefold(), address)
		return list(addresses.values())

async def configure(user_id: UUID, emails: list[str]) -> None:
	settings = RecipientSettings(emails=emails)

	try:
		async with SessionLocal.begin() as session:
			user = await session.get(User, user_id)

			if user is None:
				raise ValueError("User not found")

			user.notification_emails = [
				str(address) for address in settings.emails
			]

			print("Notification recipients updated")

	finally:
		await engine.dispose()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True, type=UUID)
    parser.add_argument("--emails", nargs="*", default=[])
    arguments = parser.parse_args()

    asyncio.run(
        configure(
            arguments.user_id,
            arguments.emails,
        )
    )


if __name__ == "__main__":
    main()