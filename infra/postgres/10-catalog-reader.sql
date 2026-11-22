\getenv reader_password POSTGRES_READER_PASSWORD
CREATE ROLE academy_reader LOGIN PASSWORD :'reader_password';
GRANT CONNECT ON DATABASE academy TO academy_reader;
GRANT USAGE ON SCHEMA public TO academy_reader;
