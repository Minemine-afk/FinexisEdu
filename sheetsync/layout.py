"""Sheet names, column headers and which columns editors may change. Shared by build and apply."""

FEES = "Fees"
LIVING = "Living costs"
UNIVERSITY_TEXT = "University text"
PROGRAMME_TEXT = "Programme text"

KEY = "Key"

# Columns editors may change, per sheet. Everything else is locked and only used to check the row.
EDITABLE = {
    FEES: ["Annual tuition", "Compulsory fees", "One-off fees", "Source type", "Source URL", "Last verified"],
    LIVING: ["Year", "Months a year", "Housing / month", "Food / month", "Transport / month",
             "Personal / month", "Source type", "Source URL", "Last verified"],
    UNIVERSITY_TEXT: ["Description (shown on hover)", "Why included (max 400)",
                      "How fees are priced (max 220, not shown)"],
    PROGRAMME_TEXT: ["Summary (shown, max 280)",
                     "How this fee was worked out (shown, max 160, one sentence, no amounts)",
                     "Fee basis (not shown, max 240)", "Notes (not shown)"],
}

# Locked columns copied from the data so a sorted, shifted or damaged row is caught.
IDENTITY = {
    FEES: ["University", "Programme", "Tier", "Row type", "Fee year"],
    LIVING: ["University"],
    UNIVERSITY_TEXT: ["University"],
    PROGRAMME_TEXT: ["University", "Programme"],
}

SOURCE_TYPES = ("official", "secondary")
