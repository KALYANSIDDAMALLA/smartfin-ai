-- Removes ALL demo users (@smartfin.demo) and everything they own (cascades). Safe to run any time; never touches real users.
delete from auth.users where email like '%@smartfin.demo';
