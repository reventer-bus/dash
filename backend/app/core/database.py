from contextlib import asynccontextmanager

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Column type for document-style storage: JSONB on Postgres, plain JSON
# elsewhere (sqlite dev fallback).
JsonDoc = JSON().with_variant(JSONB(), "postgresql")


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


@asynccontextmanager
async def session_scope():
    """One transaction per block — commits on exit, rolls back on exception."""
    _, session_factory = _get_engine()
    async with session_factory() as session:
        async with session.begin():
            yield session
