from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
         "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


class ValidationError(Exception):
    """A user-facing validation problem."""


def to_paise(value, field="Amount"):
    """Convert a rupee value (str/int/float) to integer paise."""
    try:
        d = Decimal(str(value).strip().replace(",", ""))
    except (InvalidOperation, AttributeError):
        raise ValidationError(f"{field} must be a number.")
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_rupees(paise):
    return f"{Decimal(paise) / 100:.2f}"


def calc_paise(area_sqft, rate_paise_per_sqft):
    total = Decimal(str(area_sqft)) * Decimal(rate_paise_per_sqft)
    return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _below_hundred(n):
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + " " + _ONES[n % 10]).strip()


def _below_thousand(n):
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(_ONES[hundreds] + " Hundred")
    if rest:
        parts.append(_below_hundred(rest))
    return " ".join(parts)


def _integer_words(n):
    """Indian numbering: crore, lakh, thousand."""
    if n == 0:
        return "Zero"
    parts = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1000)
    if crore:
        parts.append(_integer_words(crore) + " Crore")
    if lakh:
        parts.append(_below_hundred(lakh) + " Lakh")
    if thousand:
        parts.append(_below_hundred(thousand) + " Thousand")
    if n:
        parts.append(_below_thousand(n))
    return " ".join(parts)


def amount_in_words(paise):
    rupees, p = divmod(int(paise), 100)
    words = "Rupees " + _integer_words(rupees)
    if p:
        words += " and " + _below_hundred(p) + " Paise"
    return words + " Only"
