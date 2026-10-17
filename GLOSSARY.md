# Daiteiden

Telegram bot that tells people in Dnipro when their power is planned to go off and come back, based on the published outage schedules.

## Schedule

**Group**:
One of the numbered outage groups (1.1 … 6.2) a household belongs to; every Schedule is per Group. UI: «черга».
_Avoid_: queue, outrage group, address

**Schedule**:
The planned Power State of one Group for one calendar day (Europe/Kyiv), as published by a Source. UI: «графік».
_Avoid_: outrage, feed, timetable

**Slot**:
A 30-minute period of a Schedule with a single Power State.
_Avoid_: hour, interval

**Power State**:
What the Schedule promises for a Slot: On, Off, or Possible Off.
_Avoid_: status, light, unknown

**Possible Off**:
A Power State where an outage may or may not happen; always shown separately from Off. UI: «можливе відключення».
_Avoid_: maybe, probable outage

**Outage**:
A continuous run of Off Slots in one Group; it has a start and an end (restoration).
_Avoid_: outrage, shutdown, blackout

**Emergency Mode**:
A period when the grid operator declares emergency shutdowns and the Schedule does not apply. UI: «аварійні відключення».
_Avoid_: emergency outage, chaos mode

## Sources

**Source**:
A provider of Schedules for a region's grid operator.
_Avoid_: API, provider

**DTEK**:
The grid operator's own website, which publishes changes first, including at night. The default Preferred Source.

**Yasno**:
The supplier's public API, which lags DTEK and sometimes misses night changes.

**Preferred Source**:
The Source the Admin chose to trust first, for all Subscribers; the other one is the fallback.
_Avoid_: primary source, priority

**Active Source**:
The Source whose Schedules the bot currently trusts: the Preferred Source while it is fresh, otherwise the other one if it has newer data.

**Stale Schedule**:
The last Schedule of a Source that is no longer fresh, kept because the other Source has nothing newer; shown with a warning.

## Notifications

**Subscriber**:
A Telegram user who has chosen exactly one Group.
_Avoid_: user, account, client

**Admin**:
The bot's operator, who receives alerts about Sources and chooses the Preferred Source.

**Publication**:
The moment a Schedule for tomorrow first appears.

**Schedule Change**:
A difference in the Power States of a Subscriber's Group compared with the last Schedule they were told about.
_Avoid_: update

**Reminder**:
A message sent 30 minutes before an Outage starts (naming its end) or ends, or before a Possible Off period. An end Reminder exists only for Outages longer than 30 minutes, and an Outage followed directly by Possible Off has no end Reminder.
_Avoid_: hourly broadcast, notification
