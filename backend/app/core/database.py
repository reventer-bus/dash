from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Engine is created lazily — dashboard endpoints (farm/slicer) work without a DB
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_async_engine(settings.DATABASE_URL, echo=False)
        _SessionLocal = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    return _engine, _SessionLocal


async def get_db():
    _, session_factory = _get_engine()
    async with session_factory() as session:
        yield session
