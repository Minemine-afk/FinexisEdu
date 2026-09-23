"""Data models for the fee files. Mirrors lib/schema.ts; see data/SCHEMA.md."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

CountryCode = Literal["sg", "uk", "au", "us", "ca", "nz", "jp"]
LevelT = Literal["bachelor", "master"]
FieldT = Literal["engineering", "computing", "business", "sciences", "arts"]
TierT = Literal["citizen", "pr", "international"]
FeeKey = Literal["annualTuition", "annualCompulsoryFees", "oneOffFees"]
# Monthly living-cost categories on the university's `livingCosts` estimate.
LivingKey = Literal["living.housing", "living.food", "living.transport", "living.personal"]


class _Model(BaseModel):
    # Keep unknown keys so the scraper never silently drops data it doesn't know about.
    model_config = ConfigDict(extra="allow")


class FeeTier(_Model):
    annualTuition: float = Field(ge=0)
    annualCompulsoryFees: float = Field(default=0, ge=0)
    oneOffFees: float = Field(default=0, ge=0)


class Fees(_Model):
    citizen: FeeTier | None = None
    pr: FeeTier | None = None
    international: FeeTier


class FeeHistoryEntry(_Model):
    feeYear: int
    tier: TierT
    annualTuition: float = Field(ge=0)
    # Omitted when only tuition was published; the calculator then uses current values.
    annualCompulsoryFees: float | None = Field(default=None, ge=0)
    oneOffFees: float | None = Field(default=None, ge=0)
    sourceUrl: HttpUrl | None = None


class Programme(_Model):
    level: LevelT
    field: FieldT
    name: str = Field(min_length=1)
    durationYears: float = Field(gt=0, le=8)
    feeYear: int = Field(ge=2015, le=2100)
    fees: Fees
    sourceUrl: HttpUrl
    lastVerified: date
    sourceType: Literal["official", "secondary"] = "official"
    cohortLocked: bool = False
    notes: str | None = None
    feeHistory: list[FeeHistoryEntry] = Field(default_factory=list)


class MonthlyLiving(_Model):
    housing: float = Field(ge=0)
    food: float = Field(ge=0)
    transport: float = Field(ge=0)
    personal: float = Field(ge=0)


class LivingCosts(_Model):
    """The university's own estimate of a student's living costs, in its currency."""

    year: int = Field(ge=2015, le=2100)
    months: float = Field(gt=0, le=12)  # months per academic year the estimate covers
    monthly: MonthlyLiving
    sourceUrl: HttpUrl
    lastVerified: date
    sourceType: Literal["official", "secondary"] = "official"
    notes: str | None = None


class University(_Model):
    id: str = Field(pattern=r"^[a-z0-9-]+$")
    name: str
    country: CountryCode
    city: str
    currency: str = Field(min_length=3, max_length=3)
    website: HttpUrl | None = None
    livingCosts: LivingCosts | None = None
    programmes: list[Programme]


# ---------------------------------------------------------------------------
# Scraper registry (scrapers/registry.yaml)
# ---------------------------------------------------------------------------


class Target(BaseModel):
    """One fee figure to pull from a source page and where to store it."""

    model_config = ConfigDict(extra="forbid")

    # Which programmes of the university this figure applies to. Omitted keys match all.
    level: LevelT | None = None
    field: FieldT | None = None
    programme: str | None = None  # substring of the programme name
    tier: TierT = "international"
    # A programme fee, or a monthly living-cost category (level/field/tier are then ignored).
    key: FeeKey | LivingKey = "annualTuition"
    # Regex run on whitespace-normalised page text. The amount is its capture group;
    # with several groups (fees listed as separate line items) they are summed.
    pattern: str
    # Multiply the captured amount, e.g. 0.5 when the page quotes a per-semester fee
    # or 1/1.5 when it quotes the total for a 1.5-year programme.
    multiplier: float = 1.0


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")

    university: str
    country: CountryCode
    url: HttpUrl
    parser: Literal["html", "pdf", "browser"] = "html"
    # Regex with one capture group around a 4-digit year, e.g. r"AY\s*(\d{4})/\d{2}".
    # When the page shows a newer year than the data, the old fee goes into feeHistory.
    year_pattern: str | None = None
    # Sources a human keeps up to date. Listed in the PR when they get old.
    manual: bool = False
    targets: list[Target] = Field(default_factory=list)


class Registry(BaseModel):
    sources: list[Source]
