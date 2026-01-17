from rest_framework import serializers


class FlightSearchSerializer(serializers.Serializer):
    origin = serializers.CharField(min_length=3, max_length=8)
    destination = serializers.CharField(min_length=3, max_length=8)
    departDate = serializers.DateField()
    returnDate = serializers.DateField(required=False, allow_null=True)
    adults = serializers.IntegerField(min_value=1, max_value=6)
    cabin = serializers.ChoiceField(choices=["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"])

    # Optional: used by frontend for display; provider may ignore it
    currency = serializers.CharField(required=False, allow_null=True, min_length=3, max_length=3)

    def validate(self, attrs):
        origin = (attrs.get("origin") or "").strip().upper()
        destination = (attrs.get("destination") or "").strip().upper()
        attrs["origin"] = origin
        attrs["destination"] = destination

        currency = attrs.get("currency")
        if currency is not None:
            currency = currency.strip().upper() if isinstance(currency, str) else None
            attrs["currency"] = currency or None

        if origin and destination and origin == destination:
            raise serializers.ValidationError({"destination": "Destination must be different from origin."})

        return_date = attrs.get("returnDate")
        if return_date and return_date < attrs["departDate"]:
            raise serializers.ValidationError({"returnDate": "Return date must be on or after depart date."})

        return attrs
